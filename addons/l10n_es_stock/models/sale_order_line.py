from odoo import models


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

    def _prepare_invoice_line(self, **optional_values):
        res = super()._prepare_invoice_line(**optional_values)
        if any(tax.l10n_es_is_rebu_tax for tax in self.tax_ids):
            res['purchase_price'] = self.purchase_price
        return res
