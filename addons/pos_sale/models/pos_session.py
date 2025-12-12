# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api
from odoo.tools import str2bool


class PosSession(models.Model):
    _inherit = 'pos.session'

    crm_team_id = fields.Many2one('crm.team', related='config_id.crm_team_id', string="Sales Team", readonly=True)

    @api.model
    def _load_pos_data_models(self, config_id):
        data = super()._load_pos_data_models(config_id)
        data += ['sale.order', 'sale.order.line']
        return data

    def load_data(self, models_to_load, only_data=False):
        response = super().load_data(models_to_load, only_data)
        is_sale_automatic_invoice = str2bool(self.env['ir.config_parameter'].sudo().get_param('sale.automatic_invoice'))
        response['pos.session']['data'][0]['_is_sale_automatic_invoice'] = is_sale_automatic_invoice
        return response
