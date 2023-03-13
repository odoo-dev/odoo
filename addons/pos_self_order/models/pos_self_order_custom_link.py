# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
class PosSelfOrderCustomLink(models.Model):
    _name = 'pos_self_order.custom_link'
    _description = 'Custom links that the restaurant can configure to be displayed on the self order screen'
    name = fields.Char(string='Label', required=True, translate=True)
    url =  fields.Char(string='URL', required=True)
    pos_config_id = fields.Many2many('pos.config', string='Point of Sale')
    style = fields.Selection([('primary', 'Primary'), 
                              ('secondary', 'Secondary'),
                              ('success', 'Success'),
                              ('warning', 'Warning'), 
                              ('danger', 'Danger'),
                              ('info', 'Info'), 
                              ('light', 'Light'), 
                              ('dark', 'Dark'),
                            ],      
            string='Style', default='primary')
    sequence = fields.Integer('Sequence', default=1)

    @api.onchange('url')
    def _compute_url(self):
      for record in self:
        if record.url:
          print("sal;ut", record.url)
          record.url = record.url.replace("https://", "").replace("http://", "").replace("www.", "") # 👉️ Remove "HTTPS" and "HTTP" and "WWW"


    @api.model
    def findDefaultUrl(self):
      print("salut")
      print(self.env['ir.config_parameter'].sudo().get_param('web.base.url') + "/pos_self_order/products")

    # TODO: sanitize url input; make sure it's a valid url
    # remove http:// or https:// 
    # TODO: double check access rights
