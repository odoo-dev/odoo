# -*- coding: utf-8 -*-
from odoo import api, models
from odoo.osv import expression

class PosPrinter(models.Model):
    _inherit = 'pos.printer'

    @api.model
    def _load_pos_data_domain(self, data, config):
        domain = super()._load_pos_data_domain(data, config)
        if config.zpl_printer_id:
            domain = expression.OR([domain, [('id', '=', config.zpl_printer_id.id)]])
        return domain
