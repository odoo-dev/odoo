from odoo import api, fields, models

class PosConfig(models.Model):
    _inherit = 'pos.config'

    service_charge_rate = fields.Float(string='Service Charge Rate (%)')
    service_charge_calculation_method = fields.Selection([
        ('before_discount', 'Before Discount'),
        ('after_discount', 'After Discount')
    ], string='Calculation Method', default='before_discount')
    service_charge_preset_ids = fields.Many2many('pos.preset', 'service__charge_preset_rel', 'config_id', 'preset_id', string='Apply on Presets',
        help="Only apply service charge automatically if the order matches this preset (e.g., Dine In). Leave empty to apply to all."
    )
    service_charge_product_id = fields.Many2one('product.product', string='Service Charge Product', domain=[('sale_ok', '=', True)])

    def _get_special_products(self):
        """Include service charge product in special products so it's loaded in POS
        even if not in any category."""
        special_products = super()._get_special_products()
        if self.service_charge_rate and self.service_charge_product_id:
            special_products |= self.service_charge_product_id
        return special_products
