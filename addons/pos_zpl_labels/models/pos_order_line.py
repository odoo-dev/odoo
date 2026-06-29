# -*- coding: utf-8 -*-
from odoo import api, fields, models

class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    label_printed = fields.Boolean(string="Label Printed", default=False)

    @api.model
    def _load_pos_data_fields(self, config):
        fields_list = super()._load_pos_data_fields(config)
        fields_list.append('label_printed')
        return fields_list
