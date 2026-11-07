from odoo import models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    _l10n_jo__tax_report_vat_sale_export_exempt_local_zero_tag = models.Ref(
        'l10n_jo.tax_report_vat_sale_export_exempt_local_zero_tag', 'account.report.expression')

    def _l10n_jo_is_exempt_tax(self):
        self.ensure_one()
        exempt_tags = self._l10n_jo__tax_report_vat_sale_export_exempt_local_zero_tag._get_matching_tags()
        exempt_taxes = self.env['account.tax'].search([('repartition_line_ids.tag_ids', 'in', exempt_tags.ids)])
        return self.id in exempt_taxes.ids
