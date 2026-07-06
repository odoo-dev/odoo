# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class WebsiteRobots(models.TransientModel):
    _name = 'website.robots'
    _description = "Robots.txt Editor"
    _inherit = ['website.multi.mixin']

    content = fields.Text(related='website_id.robots_txt', readonly=False)

    def action_save(self):
        return {'type': 'ir.actions.act_window_close'}
