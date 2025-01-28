# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class EmissionSource(models.Model):
    _name = 'emission.source'
    _description = 'Emission Source'
    _order = 'level desc,sequence,name'

    sequence = fields.Integer(default=10)
    name = fields.Char(required=True)
    parent_id = fields.Many2one('emission.source')
    child_ids = fields.One2many('emission.source', 'parent_id')
    scope = fields.Selection(selection=[
            ('direct', 'Direct'),
            ('indirect', 'Indirect'),
            ('indirect_others', 'Indirect Others')
        ],
        default='direct',
        compute='_compute_scope',
        store=True,
        readonly=False,
        recursive=True,
    )
    level = fields.Integer(compute='_compute_level', store='True', recursive='True') # TODO

    @api.constrains('parent_id')
    def _check_no_cyclic_dependencies(self):
        if self._has_cycle():
            raise ValidationError(_("You cannot create a cyclic hierarchy of emission sources."))

    @api.depends('parent_id.level')
    def _compute_level(self):
        for source in self:
            source.level = source.parent_id.level + 1

    @api.depends('parent_id.scope')
    def _compute_scope(self):
        for source in self:
            source.scope = source.parent_id.scope
