# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class EventBoothCategory(models.Model):
    _name = 'event.booth.category'
    _description = 'Event Booth Category'
    _inherit = ['image.mixin']
    _order = 'sequence ASC'

    name = fields.Char(string='Name', required=True)
    sequence = fields.Integer(string='Sequence', default=10)
    description = fields.Html(string='Description')
    company_id = fields.Many2one('res.company', string="Company", default=lambda self: self.env.company)
    booth_ids = fields.One2many('event.booth', 'booth_category_id', string='Booths')
