# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models

class TestTagOwner(models.Model):
    _name = 'test_tag.owner'
    _description = 'Test Tag Owner'

    name = fields.Char(required=True)
    tag_ids = fields.One2many('test_tag.item', 'owner_id', string='Tags')

class TestTagItem(models.Model):
    _name = 'test_tag.item'
    _description = 'Test Tag Item'

    name = fields.Char(required=True)
    owner_id = fields.Many2one('test_tag.owner', string='Owner', required=True, ondelete='cascade')
