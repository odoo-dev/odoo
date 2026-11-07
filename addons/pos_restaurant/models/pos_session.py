# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, api


class PosSession(models.Model):
    _inherit = 'pos.session'

    _pos_restaurant__pos_closed_session_3 = models.Ref('pos_restaurant.pos_closed_session_3', required=False)

    @api.model
    def _load_pos_data_models(self, config):
        data = super()._load_pos_data_models(config)
        if config.module_pos_restaurant:
            data += ['restaurant.floor', 'restaurant.table', 'restaurant.order.course', 'pos.course']
        return data
