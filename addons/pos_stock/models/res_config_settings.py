from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    update_stock_quantities = fields.Selection(related="company_id.point_of_sale_update_stock_quantities", readonly=False)
