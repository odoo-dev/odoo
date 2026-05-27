import logging
import requests
from hashlib import md5
from urllib import parse

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

from odoo.addons.account.tools.partner_identifiers import format_participant_identifier
from odoo.addons.l10n_dk.tools.demo_utils import handle_demo

TIMEOUT = 10
_logger = logging.getLogger(__name__)


class ResPartner(models.Model):
    _inherit = 'res.partner'

    invoice_sending_method = fields.Selection(
        selection_add=[('nemhandel', 'By Nemhandel')],
    )
    invoice_edi_format = fields.Selection(selection_add=[('oioubl_21', "OIOUBL 2.1")])
    nemhandel_verification_state = fields.Selection(
        selection=[
            ('not_verified', 'Not verified yet'),
            ('not_valid', 'Not on Nemhandel'),  # Is not on Nemhandel
            ('valid', 'Valid'),
        ],
        string='Nemhandel endpoint verification',
        company_dependent=True,
    )

    is_using_nemhandel = fields.Boolean(compute='_compute_is_using_nemhandel')

    # -------------------------------------------------------------------------
    # COMPUTE METHODS
    # -------------------------------------------------------------------------

    @api.depends('vat', 'country_id')
    def _compute_company_registry(self):
        # OVERRIDE
        # In Denmark, if you have a VAT number, it's also your company registry (CVR) number
        super()._compute_company_registry()
        for partner in self.filtered(lambda p: p.country_id.code == 'DK' and p.vat):
            vat_country, vat_number = self._split_vat(partner.vat)
            if vat_country in ('DK', '') and self._check_vat_number('DK', vat_number):
                partner.company_registry = vat_number

    @api.depends_context('allowed_company_ids')
    @api.depends('invoice_edi_format')
    def _compute_is_using_nemhandel(self):
        nemhandel_user = self.env.company.sudo().nemhandel_edi_user
        for partner in self:
            partner.is_using_nemhandel = nemhandel_user and partner.invoice_edi_format == 'oioubl_21'

    # -------------------------------------------------------------------------
    # CONSTRAINT
    # -------------------------------------------------------------------------

    @api.constrains('invoice_edi_format', 'invoice_sending_method')
    def _check_nemhandel_send_oioubl(self):
        if self.filtered(lambda partner: partner.invoice_edi_format != 'oioubl_21' and partner.invoice_sending_method == 'nemhandel'):
            raise ValidationError(_('On Nemhandel, only OIOUBL 2.1 is supported.'))

    # -------------------------------------------------------------------------
    # OVERRIDE AND HELPERS
    # -------------------------------------------------------------------------

    def _get_edi_builder(self, invoice_edi_format):
        # EXTENDS 'account_edi_ubl_cii'
        if invoice_edi_format == 'oioubl_21':
            return self.env['account.edi.xml.oioubl_21']
        return super()._get_edi_builder(invoice_edi_format)

    def _get_ubl_cii_formats_info(self):
        # EXTENDS 'account_edi_ubl_cii'
        formats_info = super()._get_ubl_cii_formats_info()
        formats_info['oioubl_21'] = {'countries': ['DK'], 'on_peppol': False}
        return formats_info

    def _get_suggested_invoice_edi_format(self):
        # EXTENDS 'account'
        if self.country_code == 'DK':
            return 'oioubl_21'
        return super()._get_suggested_invoice_edi_format()

    @api.model
    def _get_nemhandel_participant_info(self, edi_identification):
        hash_participant = md5(edi_identification.lower().encode()).hexdigest()
        endpoint_participant = parse.quote_plus(f"iso6523-actorid-upis::{edi_identification}")
        nemhandel_user = self.env.company.sudo().nemhandel_edi_user
        edi_mode = nemhandel_user and nemhandel_user.edi_mode or self.env['ir.config_parameter'].sudo().get_str('l10n_dk.edi.mode')
        sml_zone = 'edel.sml-demo' if edi_mode == 'test' else 'edel.sml'
        smp_url = f"http://B-{hash_participant}.iso6523-actorid-upis.{sml_zone}.dataudveksling.dk/{endpoint_participant}"
        try:
            response = requests.get(smp_url, timeout=TIMEOUT)
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            _logger.info(e)
            return None
        return response.content

    @api.model
    def _nemhandel_lookup_participant(self, edi_identification):
        """NAPTR DNS nemhandel participant lookup through Odoo's Nemhandel proxy"""
        if (edi_mode := self.env.company._get_nemhandel_edi_mode()) == 'demo':
            return

        sml_zone = f"edel.sml{'-demo' if edi_mode == 'test' else ''}.dataudveksling.dk"
        origin = self.env['account_edi_proxy_client.user']._get_proxy_urls()['nemhandel'][edi_mode]
        query = parse.urlencode({'peppol_identifier': edi_identification.lower(), 'zone': sml_zone})
        endpoint = f'{origin}/api/peppol/1/lookup?{query}'

        try:
            response = requests.get(endpoint, timeout=TIMEOUT)
        except requests.exceptions.RequestException as e:
            _logger.error("failed to query nemhandel participant %s: %s", edi_identification, e)
            return

        if not response.ok:
            _logger.info('unsuccessful response %s when querying nemhandel participant %s', response.status_code, edi_identification)
            return

        try:
            decoded_response = response.json()
        except ValueError:
            _logger.error('invalid JSON response %s when querying nemhandel participant %s', response.status_code, edi_identification)
            return

        if error := decoded_response.get('error'):
            if error.get('code') != 'NOT_FOUND':
                _logger.error('error when querying nemhandel participant %s: %s', edi_identification, error.get('message', 'unknown error'))
            return

        return decoded_response.get('result')

    @api.model
    def _check_nemhandel_participant_exists(self, participant_info, edi_identification):
        service_href = ''
        if isinstance(participant_info, dict):
            participant_identifier = participant_info.get('identifier', '')
            if services := participant_info.get('services', []):
                service_href = services[0].get('href', '')
        else:
            # DEPRECATED: we now use Odoo peppol API to fetch participant info and get a json response
            # keeping this branch for compatibility
            participant_identifier = participant_info.findtext('{*}ParticipantIdentifier') or ''
            service_metadata = participant_info.find('.//{*}ServiceMetadataReference')
            if service_metadata is not None:
                service_href = service_metadata.attrib.get('href', '')

        nemhandel_user = self.env.company.sudo().nemhandel_edi_user
        edi_mode = nemhandel_user and nemhandel_user.edi_mode or self.env['ir.config_parameter'].sudo().get_str('l10n_dk.edi.mode')
        smp_nemhandel_url = 'smp-demo.nemhandel.dk' if edi_mode == 'test' else 'smp.nemhandel.dk'

        return edi_identification.lower() == participant_identifier.lower() and parse.urlsplit(service_href).netloc == smp_nemhandel_url

    def _get_nemhandel_edi_identification(self):
        """Return the first nemhandel-compatible edi identification string for this partner, or None."""
        self.ensure_one()
        for key, value in self._get_all_identifiers(enrich=True).items():
            if edi_id := format_participant_identifier(key, value):
                return edi_id
        return None

    def _update_nemhandel_verification_state(self, vals=None):
        if vals is None:
            partners = self.filtered(lambda p: p._get_nemhandel_edi_identification() and p.is_using_nemhandel)
        elif {'additional_identifiers', 'is_using_nemhandel', 'vat'}.intersection(vals.keys()):
            partners = self.filtered(lambda p: p.is_using_nemhandel)
        else:
            partners = self.env['res.partner']

        for partner in partners:
            partner.button_nemhandel_check_partner_endpoint()

    # -------------------------------------------------------------------------
    # LOW-LEVEL METHODS
    # -------------------------------------------------------------------------

    def write(self, vals):
        res = super().write(vals)
        self._update_nemhandel_verification_state(vals=vals)
        return res

    @api.model_create_multi
    def create(self, vals_list):
        res = super().create(vals_list)
        if res:
            res._update_nemhandel_verification_state()
        return res

    # -------------------------------------------------------------------------
    # ACTIONS
    # -------------------------------------------------------------------------

    @handle_demo
    def button_nemhandel_check_partner_endpoint(self, company=None):
        """Check whether a participant is reachable on the Nemhandel network."""
        self.ensure_one()
        old_value = self.nemhandel_verification_state
        self.nemhandel_verification_state = self._get_nemhandel_verification_state(self.invoice_edi_format)
        if self.nemhandel_verification_state == 'valid' and not self.invoice_sending_method:
            self.invoice_sending_method = 'nemhandel'

        if old_value != self.nemhandel_verification_state:
            self._track_add(
                initial_values={self.id: {'nemhandel_verification_state': old_value}},
                end_values={self.id: {'nemhandel_verification_state': self.nemhandel_verification_state}},
            )

        return False

    @handle_demo
    def _get_nemhandel_verification_state(self, invoice_edi_format):
        self.ensure_one()
        edi_identification = self._get_nemhandel_edi_identification()
        if not edi_identification or invoice_edi_format != 'oioubl_21':
            return 'not_verified'

        participant_info = self._nemhandel_lookup_participant(edi_identification)
        if participant_info is None:
            return 'not_valid'

        is_participant_on_network = self._check_nemhandel_participant_exists(participant_info, edi_identification)
        return 'valid' if is_participant_on_network else 'not_valid'
