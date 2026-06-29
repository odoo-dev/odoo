# -*- coding: utf-8 -*-
from odoo import api, fields, models

class ProductTemplate(models.Model):
    _inherit = 'product.template'

    to_print_label = fields.Boolean(
        string="Print Label", default=False,
        help="Print a ZPL label for this product from the PoS."
    )

    @api.model
    def _load_pos_data_fields(self, config_id):
        fields_list = super()._load_pos_data_fields(config_id)
        fields_list.append('to_print_label')
        return fields_list
