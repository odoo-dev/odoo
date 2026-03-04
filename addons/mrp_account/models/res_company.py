from odoo import models, fields

class ResCompany(models.Model):
    _inherit = 'res.company'

    stock_account_production_cost_id = fields.Many2one(
        'account.account',
        string='Production Account',
        compute=lambda self: self._compute_from_ir_default('stock_account_production_cost_id', 'product.category', 'property_stock_account_production_cost_id'),
        inverse=lambda self: self._inverse_to_ir_default('stock_account_production_cost_id', 'product.category', 'property_stock_account_production_cost_id'),
        check_company=True,
    )
