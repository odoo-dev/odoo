# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _load_data_params(self):
        params = super()._load_data_params()
        params['search_read']['pos.payment.method']['fields'].append('six_terminal_ip')
        return params

    def _loader_params_pos_payment_method(self):
        result = super()._loader_params_pos_payment_method()
        result['search_params']['fields'].append('six_terminal_ip')
        return result
