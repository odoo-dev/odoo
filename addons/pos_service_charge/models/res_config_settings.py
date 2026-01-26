from odoo import fields, models

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_service_charge_rate = fields.Float(related='pos_config_id.service_charge_rate', readonly=False)
    pos_service_charge_calculation_method = fields.Selection(related='pos_config_id.service_charge_calculation_method', readonly=False)
    pos_service_charge_preset_ids = fields.Many2many(related='pos_config_id.service_charge_preset_ids', readonly=False)
    pos_service_charge_product_id = fields.Many2one(related='pos_config_id.service_charge_product_id', readonly=False)
