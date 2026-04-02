# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, api


class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.model
    def _load_pos_data_models(self, config_id):
        data = super()._load_pos_data_models(config_id)
        data += ['mail.template']
        return data

    @api.model
    def _load_pos_self_data_domain(self, data, config):
        return [('config_id', '=', config.id), ('state', '=', 'opened')]
