# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models

class PosSession(models.Model):
    _inherit = 'pos.session'

    def _load_data_params(self):
        params = super()._load_data_params()

        params['search_read']['pos.printer']['fields'] += ['epson_printer_ip']

        return params

    def _loader_params_pos_printer(self):
        result = super()._loader_params_pos_printer()
        result['search_params']['fields'].append('epson_printer_ip')
        return result
