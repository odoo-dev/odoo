from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = "product.template"

    pos_second_uom = fields.Many2one("uom.uom", string = "POS Second UoM", domain="[('category_id', '=', uom_category_id)]")


class ProductProduct(models.Model):
    _inherit = "product.product"

    @api.model
    def _load_pos_data_fields(self, config_id):
        print("inside the inherited")
        fields = super()._load_pos_data_fields(config_id)
        fields.append('pos_second_uom')
        return fields
