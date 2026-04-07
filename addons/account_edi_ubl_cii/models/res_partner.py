# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api
from odoo.addons.account.models.company import PEPPOL_DEFAULT_COUNTRIES


class ResPartner(models.Model):
    _inherit = 'res.partner'

    invoice_edi_format = fields.Selection(
        selection_add=[
            ('facturx', "France (FacturX)"),
            ('ubl_bis3', "EU Standard (Peppol Bis 3.0)"),
            ('zugferd', "Germany (ZUGFeRD)"),
            ('xrechnung', "Germany (XRechnung)"),
            ('nlcius', "Netherlands (NLCIUS)"),
            ('ubl_a_nz', "Australia (BIS Billing 3.0 A-NZ)"),
            ('ubl_sg', "Singapore (BIS Billing 3.0 SG)"),
        ],
    )
    is_ubl_format = fields.Boolean(compute='_compute_is_ubl_format')
    is_peppol_edi_format = fields.Boolean(compute='_compute_is_peppol_edi_format')  # TODO remove in master

    @api.model
    def _get_ubl_cii_formats(self):
        return list(self._get_ubl_cii_formats_info().keys())

    @api.model
    def _get_ubl_cii_formats_info(self):
        return {
            'ubl_bis3': {
                'countries': list(PEPPOL_DEFAULT_COUNTRIES),
                'on_peppol': True,
                'sequence': 200,
                'embed_attachments': True,
            },
            'xrechnung': {'countries': ['DE'], 'sequence': 200, 'on_peppol': True},
            'ubl_a_nz': {'countries': ['NZ', 'AU'], 'on_peppol': False},  # Not yet available through Odoo's Access Point, although it's a Peppol valid format
            'nlcius': {'countries': ['NL'], 'on_peppol': True},
            'ubl_sg': {'countries': ['SG'], 'on_peppol': False},  # Same.
            'facturx': {'countries': ['FR'], 'on_peppol': False},
            'zugferd': {'countries': ['DE'], 'on_peppol': False},
        }

    @api.model
    def _get_ubl_cii_formats_by_country(self):
        formats_info = self._get_ubl_cii_formats_info()
        countries = {country for format_val in formats_info.values() for country in (format_val.get('countries') or [])}
        return {
            country_code: [
                format_key
                for format_key, format_val in formats_info.items() if country_code in (format_val.get('countries') or [])
            ]
            for country_code in countries
        }

    def _get_suggested_ubl_cii_edi_format(self):
        self.ensure_one()
        format_mapping = self._get_ubl_cii_formats_by_country()
        country_code = self.commercial_partner_id._deduce_country_code()
        if country_code in format_mapping:
            formats_by_country = format_mapping[country_code]
            if len(formats_by_country) == 1:
                return formats_by_country[0]
            else:
                # DE has both zugferd and xrechnung; pick xrechnung if Leitweg-ID is set
                eas, _endpoint = self.env['account.edi.xml.ubl_bis3']._get_eas_endpoint(self.commercial_partner_id)
                if eas == '0204':
                    return 'xrechnung'
                formats_info = self._get_ubl_cii_formats_info()
                return min(formats_by_country, key=lambda e: formats_info[e].get('sequence', 100))
        return False

    def _get_suggested_peppol_edi_format(self):
        self.ensure_one()
        suggested_format = self.commercial_partner_id._get_suggested_ubl_cii_edi_format()
        return suggested_format if suggested_format in self.env['res.partner']._get_peppol_formats() else 'ubl_bis3'

    def _get_peppol_edi_format(self):
        self.ensure_one()
        return self.invoice_edi_format or self._get_suggested_peppol_edi_format()

    @api.model
    def _get_peppol_formats(self):
        formats_info = self._get_ubl_cii_formats_info()
        return [format_key for format_key, format_vals in formats_info.items() if format_vals.get('on_peppol')]

    @api.depends_context('company')
    @api.depends('invoice_edi_format')
    def _compute_is_ubl_format(self):
        for partner in self:
            partner.is_ubl_format = partner.invoice_edi_format in self._get_ubl_cii_formats()

    @api.depends_context('company')
    @api.depends('invoice_edi_format')
    def _compute_is_peppol_edi_format(self):
        for partner in self:
            partner.is_peppol_edi_format = partner.invoice_edi_format in self._get_peppol_formats()

    @api.model
    def _get_edi_builder(self, invoice_edi_format):
        if invoice_edi_format == 'xrechnung':
            return self.env['account.edi.xml.ubl_de']
        # Same template for the two formats (France and Germany)
        if invoice_edi_format in ('facturx', 'zugferd'):
            return self.env['account.edi.xml.cii']
        if invoice_edi_format == 'ubl_a_nz':
            return self.env['account.edi.xml.ubl_a_nz']
        if invoice_edi_format == 'nlcius':
            return self.env['account.edi.xml.ubl_nl']
        if invoice_edi_format == 'ubl_bis3':
            return self.env['account.edi.xml.ubl_bis3']
        if invoice_edi_format == 'ubl_sg':
            return self.env['account.edi.xml.ubl_sg']
