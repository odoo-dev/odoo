import logging

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError
from odoo.addons.account.models.company import PEPPOL_LIST
from odoo.addons.account.tools.partner_identifiers import (
    ISO_IDENTIFIERS_METADATA,
    format_participant_identifier,
    get_identifier_metadata,
    is_tin,
    is_additional_identifier,
    is_identifier_void,
    validate_participant_identifier,
    validation_error_message,
)
from odoo.addons.account_peppol.tools.peppol_iap_connector import PeppolIAPConnector

PEPPOL_CACHE_TTL = 7  # days

_logger = logging.getLogger(__name__)


class ResPartner(models.Model):
    _inherit = 'res.partner'

    invoice_sending_method = fields.Selection(
        selection_add=[('peppol', 'by Peppol')],
    )
    peppol_metadata = fields.Json()  # used to cache information fetched from the Peppol Network
    peppol_metadata_updated_at = fields.Datetime(string="Last sync")
    peppol_send_to_endpoint = fields.Char(
        string='Send to',
        compute='_compute_peppol_send_to_endpoint',
        inverse='_inverse_peppol_send_to_endpoint',
        tracking=True,
    )
    peppol_verification_state = fields.Selection(
        selection=[
            ('not_verified', 'Unchecked'),
            ('not_valid', 'Partner is not on Peppol'),
            ('valid', 'Partner is on Peppol'),
        ],
        string='Peppol status',
        compute='_compute_peppol_verification_state',
        tracking=True,
    )
    available_peppol_sending_methods = fields.Json(compute='_compute_available_peppol_sending_methods')
    available_peppol_edi_formats = fields.Json(compute='_compute_available_peppol_edi_formats')

    @api.depends_context('company')
    def _compute_display_electronic_invoicing(self):
        # EXTENDS 'account'
        super()._compute_display_electronic_invoicing()
        for partner in self:
            partner.display_electronic_invoicing = (
                bool(self.env.company.peppol_can_send)
                and partner.country_code in PEPPOL_LIST
            )

    @api.depends_context('company')
    @api.depends('company_id')
    def _compute_available_peppol_sending_methods(self):
        methods = dict(self._fields['invoice_sending_method'].selection)
        if self.env.company.country_code not in PEPPOL_LIST:
            methods.pop('peppol')
        self.available_peppol_sending_methods = list(methods)

    @api.depends_context('company')
    @api.depends('invoice_sending_method')
    def _compute_available_peppol_edi_formats(self):
        for partner in self:
            if partner.invoice_sending_method == 'peppol':
                partner.available_peppol_edi_formats = self._get_peppol_formats()
            else:
                partner.available_peppol_edi_formats = list(dict(self._fields['invoice_edi_format'].selection))

    @api.depends('peppol_metadata')
    def _compute_peppol_send_to_endpoint(self):
        for partner in self:
            partner.peppol_send_to_endpoint = (partner.peppol_metadata or {}).get('identifier')

    def _inverse_peppol_send_to_endpoint(self):
        for partner in self:
            if not partner.peppol_send_to_endpoint:
                continue
            identifier_value = partner.peppol_send_to_endpoint
            # 1. Ensure identifier passes validation
            validation = validate_participant_identifier(identifier_value)
            identifier_key = validation['key']
            if not validation['valid']:
                raise ValidationError(validation_error_message(self.env, identifier_key, identifier_value, example=validation['example']))
            identifier_value = validation['value']
            # 2. Ensure identifier is on Peppol
            participant_info = self._peppol_lookup(identifier_value)
            if not participant_info:
                raise UserError(self.env._("Entity with identifier %s not found on Peppol Network.", identifier_value))
            self.peppol_metadata = {**(self.peppol_metadata or {}), **participant_info}
            self.peppol_metadata_updated_at = fields.Datetime.now()
            # 3. Insert it in the additional_identifier/VAT if it's handled and not already set.
            if identifier_key:
                identifier_meta = get_identifier_metadata(identifier_key)
                if is_tin(identifier_meta) and is_identifier_void(self.vat):
                    self.vat = identifier_value
                elif is_additional_identifier(identifier_meta) and not self._get_additional_identifier(identifier_key):
                    self._set_additional_identifier(identifier_key, identifier_value)
            _logger.info('event=peppol_manual_send_to_endpoint_success partner_id=%s identifier=%s', self.id, identifier_value)

    @api.depends('peppol_metadata')
    def _compute_peppol_verification_state(self):
        for partner in self:
            if partner.peppol_metadata_updated_at:
                if partner.peppol_metadata:
                    partner.peppol_verification_state = 'valid'
                else:
                    partner.peppol_verification_state = 'not_valid'
            else:
                partner.peppol_verification_state = 'not_verified'

    # -------------------------------------------------------------------------
    # HELPERS
    # -------------------------------------------------------------------------

    def _peppol_get_possible_identifiers(self, enrich=False):
        self.ensure_one()
        identifiers = set()
        for odoo_key, value in self._get_all_identifiers(enrich=enrich).items():
            if peppol_identifier := format_participant_identifier(odoo_key, value):
                identifiers.add(peppol_identifier)
        return sorted(
            identifiers,
            key=lambda endpoint: ISO_IDENTIFIERS_METADATA.get(endpoint.partition(':')[0], {}).get('sequence', 100),
        )

    def _peppol_lookup(self, peppol_identifier):
        self.ensure_one()
        company = self.company_id or self.env.company
        return PeppolIAPConnector(company).lookup(peppol_identifier)

    def _peppol_find_partner_on_network(self):
        self.ensure_one()
        participant_info = None
        for peppol_identifier in self._peppol_get_possible_identifiers():
            if participant_info := self._peppol_lookup(peppol_identifier):
                break
        return participant_info

    def _peppol_sync_partner_metadata(self, force=False):
        self.ensure_one()

        # sync only if it make sense for company and partner
        peppol_companies = (self.company_id + self.env.company).filtered('peppol_can_send')
        if not peppol_companies:
            _logger.debug('event=peppol_sync_partner_skipped reason=no_company_on_peppol partner_id=%s', self.id)
            return
        if not bool(self._peppol_get_possible_identifiers()):
            _logger.debug('event=peppol_sync_partner_skipped reason=no_possible_identifiers partner_id=%s', self.id)
            return

        # re-sync only if last sync is old enough
        is_last_sync_too_old = (
            not self.peppol_metadata_updated_at
            or self.peppol_metadata_updated_at <= fields.Datetime.subtract(fields.Datetime.now(), days=PEPPOL_CACHE_TTL)
        )
        if not is_last_sync_too_old and not force:
            _logger.debug('event=peppol_sync_partner_skipped reason=last_sync_not_too_old partner_id=%s', self.id)
            return

        participant_info = None
        if self.peppol_verification_state == 'valid':
            # only refresh the selected endpoint data
            participant_info = self._peppol_lookup(self.peppol_send_to_endpoint)
        if self.peppol_verification_state != 'valid' or not participant_info:
            # find a valid endpoint
            participant_info = self._peppol_find_partner_on_network()

        if participant_info:
            self.peppol_metadata = {**(self.peppol_metadata or {}), **participant_info}

        self.peppol_metadata_updated_at = fields.Datetime.now()
        _logger.info('event=peppol_sync_partner_success partner_id=%s', self.id)

    def _peppol_is_service_supported(self, peppol_identifier, process=None, document=None):
        self.ensure_one()
        # FIXME not used yet, still need to decide how to represent process and document. Check with ABOO's PR.
        return (
            self.peppol_metadata
            and peppol_identifier == self.peppol_metadata.get('identifier')
            and any(service.get('document_id') == document for service in self.peppol_metadata.get('services', []))
        )

    # -------------------------------------------------------------------------
    # LOW-LEVEL METHODS
    # -------------------------------------------------------------------------

    @api.model_create_multi
    def create(self, vals_list):
        res = super().create(vals_list)
        if res:
            for partner in res:
                partner._peppol_sync_partner_metadata()  # will only be sync'ed when it makes sense
        return res

    # -------------------------------------------------------------------------
    # BUSINESS ACTIONS
    # -------------------------------------------------------------------------

    def button_peppol_sync(self):
        self.ensure_one()
        if not self.env.company.peppol_can_send:
            raise UserError(self.env._("Your company is not registered on Peppol Network.")) # TODO: add link to peppol registration wizard

        if not bool(self._peppol_get_possible_identifiers()):
            raise UserError(self.env._("Contact has no possible Peppol identifier set."))
        self._peppol_sync_partner_metadata(force=True)
