from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_es_edi_verifactu_certificate_ids = fields.One2many(
        string="Veri*Factu Certificates",
        comodel_name='certificate.certificate',
        inverse_name='company_id',
    )
    l10n_es_edi_verifactu_required = fields.Boolean(
        string="Enable Veri*Factu",
        copy=False,
    )
    l10n_es_edi_verifactu_test_environment = fields.Boolean(
        string="Veri*Factu Test Environment",
        default=True,
        copy=False,
    )
    l10n_es_edi_verifactu_special_vat_regime = fields.Selection(
        string="Veri*Factu VAT Regime",
        selection=[
            ('simplified', "Simplified Regime"),
            ('reagyp', "REAGYP (Special Regime for Agriculture, Livestock and Fisheries)"),
            ('recargo', "Recargo de Equivalencia"),
        ],
        help="Leave empty for the normal regimen.",
    )

    def _l10n_es_edi_verifactu_get_endpoints(self):
        """
        For the SOAP endpoints see:
        https://prewww2.aeat.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl
        """
        self.ensure_one()
        wsdl_base = {
            'url': 'https://prewww2.aeat.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl',
            'service': 'sfVerifactu',
            'registration': 'RegFactuSistemaFacturacion',
            'port': None,
        }
        if self.l10n_es_edi_verifactu_test_environment:
            endpoints = {
                'wsdl': wsdl_base | {'port': 'SistemaVerifactuPruebas'},
                'verifactu': 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
                'QR': 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
            }
        else:
            endpoints = {
                'wsdl': wsdl_base | {'port': 'SistemaVerifactu'},
                'verifactu': 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
                'QR': 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
            }
        return endpoints

    def _l10n_es_edi_verifactu_get_certificate(self):
        self.ensure_one()
        return self.env['certificate.certificate'].search(
            [('company_id', '=', self.id), ('scope', '=', 'verifactu')],
            order='date_end desc',
            limit=1,
        )

    def write(self, vals):
        # EXTENDS 'base'
        newly_required = self.env['res.company']
        if vals.get('l10n_es_edi_verifactu_required'):
            newly_required = self.filtered(lambda c: not c.l10n_es_edi_verifactu_required)
        res = super().write(vals)
        if newly_required:
            newly_required._l10n_es_edi_verifactu_backfill_recargo_regime_codes()
        return res

    def _l10n_es_edi_verifactu_backfill_recargo_regime_codes(self):
        """VeriFactu's ClaveRegimen catalog is the only one that tags "Recargo de equivalencia"
        operations via '18_iva'/'18_igic' (see l10n_es_edi_verifactu/const.py); the shared core
        catalog in l10n_es doesn't set anything on these taxes, since it's meaningless without
        VeriFactu. Backfill it here, once, for the taxes that already existed when a company turns
        VeriFactu on. Recargo taxes created afterwards aren't auto-filled — same as any other
        VAT Regime Code, the user picks one from the (now VeriFactu-aware) dropdown.
        """
        recargo_taxes = self.env['account.tax'].search([
            ('company_id', 'in', self.ids),
            ('type_tax_use', '=', 'sale'),
            ('l10n_es_type', '=', 'recargo'),
            ('l10n_es_regime_code', '=', False),
        ])
        for tax in recargo_taxes:
            tax.l10n_es_regime_code = '18_igic' if tax.l10n_es_applicability == '03' else '18_iva'
