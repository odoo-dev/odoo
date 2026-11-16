from odoo import api, fields, models

from odoo.addons.account.models.company import PEPPOL_DEFAULT_COUNTRIES


class ResPartner(models.Model):
    _inherit = 'res.partner'

    invoice_edi_format = fields.Selection(
        selection_add=[
            ('ubl_bis3', "EU Standard (Peppol Bis 3.0)"),
            ('xrechnung', "Germany (XRechnung)"),
            ('nlcius', "Netherlands (NLCIUS)"),
            ('ubl_a_nz', "Australia (BIS Billing 3.0 A-NZ)"),
            ('ubl_sg', "Singapore (BIS Billing 3.0 SG)"),
        ],
    )

    @api.model
    def _get_ubl_cii_formats_info(self):
        # EXTENDS account_edi_cii
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
            **super()._get_ubl_cii_formats_info(),
        }

    @api.model
    def _get_edi_builder(self, invoice_edi_format):
        # EXTENDS account_edi_cii
        builder_model = {
            'ubl_bis3': 'account.edi.xml.ubl_bis3',
            'xrechnung': 'account.edi.xml.ubl_de',
            'nlcius': 'account.edi.xml.ubl_nl',
            'ubl_a_nz': 'account.edi.xml.ubl_a_nz',
            'ubl_sg': 'account.edi.xml.ubl_sg',
        }.get(invoice_edi_format)
        if builder_model:
            return self.env[builder_model]
        return super()._get_edi_builder(invoice_edi_format)

    def _get_suggested_peppol_edi_format(self):
        self.ensure_one()
        suggested_format = self.commercial_partner_id._get_suggested_ubl_cii_edi_format()
        return suggested_format if suggested_format in self.env['res.partner']._get_peppol_formats() else 'ubl_bis3'

    def _get_peppol_edi_format(self):
        self.ensure_one()
        return self.invoice_edi_format or self._get_suggested_peppol_edi_format()
