import logging
import requests

from markupsafe import Markup
from urllib import parse

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

from odoo.addons.l10n_fr_pdp.tools.demo_utils import handle_demo

TIMEOUT = 10
_logger = logging.getLogger(__name__)


class ResPartner(models.Model):
    _inherit = 'res.partner'

    invoice_edi_format = fields.Selection(selection_add=[('ubl_21_fr', "France E-Invoicing (UBL 2.1)")])
    pdp_verification_display_state = fields.Selection(
        selection=[
            ('not_verified', 'Not verified yet'),
            ('pdp_not_valid', 'Partner is not in the annuaire'),
            ('pdp_not_valid_format', 'Partner cannot receive format'),
            ('pdp_valid', 'Partner is in the annuaire'),
            ('peppol_not_valid', 'Partner is not on Peppol'),  # does not exist on Peppol at all
            ('peppol_not_valid_format', 'Partner cannot receive format'),  # registered on Peppol but cannot receive the selected document type
            ('peppol_valid', 'Partner is on Peppol'),
        ],
        string='PDP State',
        company_dependent=True,
        compute="_compute_pdp_verification_display_state",
    )
    is_using_pdp = fields.Boolean(compute='_compute_is_using_pdp')

    # -------------------------------------------------------------------------
    # COMPUTE METHODS
    # -------------------------------------------------------------------------

    @api.depends_context('allowed_company_ids')
    @api.depends('country_code', 'vat')
    def _compute_is_using_pdp(self):
        pdp_user = self.env.company.sudo().account_peppol_edi_user
        for partner in self:
            partner.is_using_pdp = pdp_user and (partner.siret or partner._deduce_country_code() == 'FR')

    @api.depends('peppol_verification_state', 'peppol_endpoint', 'peppol_eas')
    def _compute_pdp_verification_display_state(self):
        for partner in self:
            partner.pdp_verification_display_state = partner._get_pdp_display_verification_state(partner.peppol_verification_state)

    # -------------------------------------------------------------------------
    # CONSTRAINT
    # -------------------------------------------------------------------------

    @api.constrains('invoice_edi_format', 'invoice_sending_method')
    def _check_pdp_send_ubl_21_fr(self):
        if self.filtered(
            lambda partner: (
                partner.invoice_sending_method == "peppol"
                and partner._get_pdp_receiver_identification_info()[0] == 'pdp'
                and partner.invoice_edi_format != "ubl_21_fr"
            )
        ):
            ubl_21_fr_string = dict(self._fields['invoice_edi_format']._description_selection(self.env))['ubl_21_fr']
            raise ValidationError(_('For French regulated invoices, only %(format_name)s is supported.', format_name=ubl_21_fr_string))

    # -------------------------------------------------------------------------
    # OVERRIDE AND HELPERS
    # -------------------------------------------------------------------------

    def _get_suggested_pdp_identifier(self):
        self.ensure_one()
        siret = self.siret or ''
        siren = siret[:9]
        if len(siret) == 9:
            return siret[:9]
        elif len(siret) == 14:
            return f"{siren}_{siret}"
        return False

    def _get_peppol_endpoint_value(self, country_code, field):
        self.ensure_one()
        if country_code != 'FR' or field != 'peppol_endpoint':
            return super()._get_peppol_endpoint_value(country_code, field)

        return self._get_suggested_pdp_identifier()

    def _build_error_peppol_endpoint(self, eas, endpoint):
        # Extend 'account_edi_ubl_cii' for '0225' endpoint
        if eas != '0225':
            return super()._build_error_peppol_endpoint(eas, endpoint)
        if not self.env["res.company"]._check_pdp_identifier(endpoint):
            return _("The Peppol endpoint is not valid. The expected format is: SIREN, SIREN_SIRET, SIREN_SIRET_CodeRoutage or SIREN_SuffixeAdressage")

    def _get_edi_builder(self, invoice_edi_format):
        # EXTENDS 'account_edi_ubl_cii'
        if invoice_edi_format == 'ubl_21_fr':
            return self.env['account.edi.xml.ubl_21_fr']
        return super()._get_edi_builder(invoice_edi_format)

    def _get_ubl_cii_formats_info(self):
        # EXTENDS 'account_edi_ubl_cii'
        formats_info = super()._get_ubl_cii_formats_info()
        formats_info['ubl_21_fr'] = {'countries': ['FR'], 'on_peppol': True}
        return formats_info

    def _get_suggested_invoice_edi_format(self):
        # EXTENDS 'account'
        if self.country_code == 'FR':
            return 'ubl_21_fr'
        return super()._get_suggested_invoice_edi_format()

    def _get_pdp_display_verification_state(self, state=None):
        self.ensure_one()
        state = state if state is not None else self.peppol_verification_state
        if not state or state == 'not_verified':
            return state
        elif self._get_pdp_receiver_identification_info()[0] == 'pdp':
            return f'pdp_{state}'
        else:
            return f'peppol_{state}'

    def _get_suggested_peppol_edi_format(self):
        # EXTENDS 'account_edi_ubl_cidd`
        self.ensure_one()
        if self.commercial_partner_id._get_pdp_receiver_identification_info()[0] == 'pdp':
            return 'ubl_21_fr'
        return super()._get_suggested_peppol_edi_format()

    def _log_verification_state_update(self, company, old_value, new_value):
        # log the update of the pdp verification state
        # we do this instead of regular tracking because of the customized message
        # and because we want to log the change for every company in the db
        if self._get_pdp_receiver_identification_info()[0] != 'pdp':
            return super()._log_verification_state_update(company, old_value, new_value)
        if old_value == new_value:
            return

        state_field = self._fields['pdp_verification_display_state']
        selection_values = dict(state_field.selection)
        old_display_state = self._get_pdp_display_verification_state(state=old_value)
        new_display_state = self._get_pdp_display_verification_state(state=new_value)
        old_label = selection_values[old_display_state] if old_value else False  # get translated labels
        new_label = selection_values[new_display_state] if new_value else False

        body = Markup("""
            <ul>
                <li>
                    <span class='o-mail-Message-trackingOld me-1 px-1 text-muted fw-bold'>{old}</span>
                    <i class='o-mail-Message-trackingSeparator fa fa-long-arrow-right mx-1 text-600'/>
                    <span class='o-mail-Message-trackingNew me-1 fw-bold text-info'>{new}</span>
                    <span class='o-mail-Message-trackingField ms-1 fst-italic text-muted'>({field})</span>
                    <span class='o-mail-Message-trackingCompany ms-1 fst-italic text-muted'>({company})</span>
                </li>
            </ul>
        """).format(
            old=old_label,
            new=new_label,
            field=state_field.string,
            company=company.display_name,
        )
        self._message_log(body=body)

    @api.model
    def _pdp_peppol_lookup_participant(self, edi_identification):
        """NAPTR DNS peppol participant lookup through Odoo's Peppol proxy"""
        edi_mode = self.env.company._get_peppol_edi_mode()
        origin = self.env['account_edi_proxy_client.user']._get_proxy_urls()['pdp'][edi_mode]
        query = parse.urlencode({'peppol_identifier': edi_identification.lower()})
        endpoint = f'{origin}/api/pdp/1/peppol_lookup?{query}'

        try:
            response = requests.get(endpoint, timeout=TIMEOUT)
        except requests.exceptions.RequestException as e:
            _logger.debug("failed to query peppol participant %s: %s", edi_identification, e)
            return

        try:
            decoded_response = response.json()
        except ValueError:
            _logger.error('invalid JSON response %s when querying peppol participant %s', response.status_code, edi_identification)
            return

        if error := decoded_response.get('error'):
            if error.get('code') != 'NOT_FOUND':
                _logger.error('error when querying peppol participant %s: %s', edi_identification, error.get('message', 'unknown error'))
            return

        if not response.ok:
            _logger.error('unsuccessful response %s when querying peppol participant %s', response.status_code, edi_identification)
            return

        return decoded_response.get('result')

    @api.model
    @handle_demo
    def _get_peppol_verification_state(self, peppol_endpoint, peppol_eas, invoice_edi_format):
        proxy_type, edi_identification = self._get_peppol_proxy_identification_info(peppol_eas, peppol_endpoint)
        if proxy_type != 'pdp':
            return super()._get_peppol_verification_state(peppol_endpoint, peppol_eas, invoice_edi_format)
        return self._get_pdp_annuaire_verification_state(edi_identification, invoice_edi_format)

    @api.model
    def _get_pdp_annuaire_verification_state(self, edi_identification, invoice_edi_format):
        if not edi_identification:
            return 'not_verified'
        if invoice_edi_format != 'ubl_21_fr':
            return 'not_valid_format'
        participant_info = self._pdp_annuaire_lookup_participant(edi_identification)
        if (participant_info or {}).get('in_annuaire'):
            return 'valid'
        return 'not_valid'

    @api.model
    @handle_demo
    def _pdp_annuaire_lookup_participant(self, edi_identification):
        edi_mode = self.env.company._get_peppol_edi_mode()
        origin = self.env['account_edi_proxy_client.user']._get_proxy_urls()['pdp'][edi_mode]
        pdp_identifier = edi_identification.partition(":")[2]
        query = parse.urlencode({'pdp_identifier': pdp_identifier.lower()})
        endpoint = f'{origin}/api/pdp/1/annuaire_lookup?{query}'

        try:
            response = requests.get(endpoint, timeout=TIMEOUT)
        except requests.exceptions.RequestException as e:
            _logger.debug("failed to query annuaire for identifier %s: %s", edi_identification, e)
            return

        try:
            decoded_response = response.json()
        except ValueError:
            _logger.error('invalid JSON response %s when querying annuaire for identifier %s', response.status_code, edi_identification)
            return

        if error := decoded_response.get('error'):
            _logger.error('error when querying annuaire for identifier %s: %s', edi_identification, error.get('message', 'unknown error'))
            return

        if not response.ok:
            _logger.error('unsuccessful response %s when querying annuaire for identifier %s', response.status_code, edi_identification)
            return

        return decoded_response.get('result')

    def _get_pdp_receiver_identification_info(self):
        return self._get_peppol_proxy_identification_info(self.peppol_eas, self.peppol_endpoint)

    # TODO: remove or move to `account_pepopl`?
    @api.model
    def _get_peppol_proxy_identification_info(self, peppol_eas, peppol_endpoint):
        # Return tuple `(proxy_type, peppol_identifier)` where `peppol_identifier` is in form "{scheme}:{identifier}"
        if not peppol_eas or not peppol_endpoint:
            return None, ""
        identifier = f"{peppol_eas}:{peppol_endpoint}"
        proxy_type = 'pdp' if peppol_eas == '0225' else 'peppol'
        return proxy_type, identifier
