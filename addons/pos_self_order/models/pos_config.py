# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError

class PosConfig(models.Model):
    _inherit = 'pos.config'

    @api.depends('self_order_view_mode')
    def _onchange_self_order_view_mode(self):
        print("asdfs")
        print("asdfs")
        print("asdfs")
        print("asdfs")
        print("asdfs")
        print("asdfs")
    #     self.ensure_one()
    #     if self.self_order_view_mode:
    #         self.env['pos_self_order.custom_link'].create({
    #             'name': _('View Menu'),
    #             'url' : f"{self.env['ir.config_parameter'].sudo().get_param('web.base.url')}/menu?pos_id={self.id}",
    #             'pos_config_id': [(6, 0, [self.id])],
    #         })
    #     else:
    #         self.env['pos_self_order.custom_link'].search([('url', '=', f"{self.env['ir.config_parameter'].sudo().get_param('web.base.url')}/menu?pos_id={self.id}")]).unlink()
    #     print("salut", self.env['pos_self_order.custom_link'].search([]).read())






    def self_order_allow_view_menu(self):
        """
        Returns True if the menu can be viewed by customers on their phones, by scanning the QR code on the table and going to the provided URL.
        :return: True if the menu can be viewed, False otherwise
        :rtype: bool
        """
        self.ensure_one()
        return self.self_order_view_mode 
