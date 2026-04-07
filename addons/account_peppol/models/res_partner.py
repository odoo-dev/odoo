import logging

from odoo import api, fields, models
from odoo.addons.account.models.company import PEPPOL_LIST
from odoo.addons.account.tools.partner_identifiers import (
    ISO_IDENTIFIERS_METADATA,
    format_participant_identifier,
    get_identifier_metadata,
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
        compute='_compute_peppol_info',
    )
    peppol_override_send_to_endpoint = fields.Char(
        string='Specific Peppol Endpoint',
        help='If set, this endpoint will be used instead of the one found via available information on the partner.',
    )
    peppol_verification_state = fields.Selection(
        selection=[
            ('not_verified', 'Unchecked'),
            ('not_valid', 'Partner is not on Peppol'),
            ('valid', 'Partner is on Peppol'),
        ],
        string='Peppol status',
        compute='_compute_peppol_info',
    )
    available_peppol_sending_methods = fields.Json(compute='_compute_available_peppol_sending_methods')
    available_peppol_edi_formats = fields.Json(compute='_compute_available_peppol_edi_formats')

    # @api.constrains('peppol_send_to_endpoint')
    # def _check_peppol_send_to_endpoint(self):
    #     for partner in self:
    #         validation = validate_participant_identifier(partner.peppol_send_to_endpoint)
    #         if not validation['valid']:
    #             raise UserError(self.env._("Invalid Peppol endpoint"))

    @api.onchange('peppol_send_to_endpoint')
    def _onchange_verify_peppol_status(self):
        self._peppol_sync_partner_metadata(force=True)

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
    def _compute_peppol_info(self):
        for partner in self:
            send_to_endpoint = None
            if partner.peppol_metadata_updated_at:
                if partner.peppol_metadata:
                    send_to_endpoint = partner.peppol_metadata.get('identifier')
                    partner.peppol_verification_state = 'valid'
                else:
                    partner.peppol_verification_state = 'not_valid'
            else:
                partner.peppol_verification_state = 'not_verified'
            partner.peppol_send_to_endpoint = send_to_endpoint

    # -------------------------------------------------------------------------
    # HELPERS
    # -------------------------------------------------------------------------

    def _peppol_get_possible_identifiers(self, enrich=False):
        self.ensure_one()
        identifiers = set()
        for odoo_key, value in self._get_all_identifiers(enrich=enrich).items():
            if peppol_identifier := format_participant_identifier(odoo_key, value):
                identifiers.add(peppol_identifier)
        if self.peppol_override_send_to_endpoint and self.peppol_override_send_to_endpoint not in identifiers:
            identifiers.add(self.peppol_override_send_to_endpoint)
        return sorted(
            list(identifiers),
            key=lambda endpoint: ISO_IDENTIFIERS_METADATA.get(endpoint.partition(':')[0], {}).get('sequence', 100),
        )

    def _peppol_should_lookup(self):
        """ Lookup only when it make sense:
        The company must use Peppol, and the partner has possible identifiers set.
        """
        self.ensure_one()
        company = self.company_id or self.env.company
        partner_has_identifiers = bool(self._peppol_get_possible_identifiers())
        return company.peppol_can_send and partner_has_identifiers

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

        # re-sync only if it make sense for company and partner
        if not self._peppol_should_lookup():
            _logger.debug('event=peppol_sync_partner_skipped reason=should_not_lookup partner_id=%s', self.id)
            return

        # re-sync only if last sync is old enough
        is_last_sync_too_old = (
            not self.peppol_metadata_updated_at
            or self.peppol_metadata_updated_at <= fields.Datetime.subtract(fields.Datetime.now(), days=PEPPOL_CACHE_TTL)
        )
        if not is_last_sync_too_old and not force:
            _logger.debug('event=peppol_sync_partner_skipped reason=last_sync_not_too_old partner_id=%s', self.id)
            return

        if self.peppol_verification_state == 'valid':
            # only refresh the selected endpoint data
            participant_info = self._peppol_lookup(self.peppol_send_to_endpoint)
        else:
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
            res.button_peppol_sync()  # will only be sync'ed when it makes sense
        return res

    # -------------------------------------------------------------------------
    # BUSINESS ACTIONS
    # -------------------------------------------------------------------------

    def button_peppol_sync(self, force=True):
        self.ensure_one()
        self._peppol_sync_partner_metadata(force=force)
