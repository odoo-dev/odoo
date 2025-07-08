# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class UnicommerceChannel(models.Model):
    _name = 'unicommerce.channel'
    _description = "Unicommerce Channel"
    
    name = fields.Char(string="Channel Name")
    code = fields.Char(string="Code")
