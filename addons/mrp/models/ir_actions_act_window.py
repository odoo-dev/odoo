from odoo import models


class IrActionsActWindow(models.Model):
    _inherit = 'ir.actions.act_window'

    _stock__action_product_stock_view = models.Ref('stock.action_product_stock_view', 'ir.actions.act_window', required=False)
