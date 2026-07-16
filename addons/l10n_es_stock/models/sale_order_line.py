from odoo import models


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

    def _prepare_invoice_line(self, **optional_values):
        res = super()._prepare_invoice_line(**optional_values)
        rebu_tax = self.env.ref('account.2_account_tax_template_rebu')
        if rebu_tax in self.tax_ids:
            res['purchase_price'] = self.purchase_price
        return res
