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
          # TODO: make sure the url sanitization is done correctly
          record.url = record.url.replace("https://", "").replace("http://", "").replace("www.", "")
    
    # TODO: double check access rights for this model
