from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class EsgEmissionSource(models.Model):
    _name = 'esg.emission.source'
    _description = 'Emission Source'
    _order = 'level desc,sequence,name'
    _rec_name = 'complete_name'

    sequence = fields.Integer(default=10)
    name = fields.Char(required=True)
    parent_id = fields.Many2one('esg.emission.source')
    child_ids = fields.One2many('esg.emission.source', 'parent_id')
    complete_name = fields.Char(compute='_compute_complete_name', recursive=True, store=True)
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

    @api.depends('name', 'parent_id.complete_name')
    def _compute_complete_name(self):
        for source in self:
            if self.parent_id:
                source.complete_name = '%s > %s' % (source.parent_id.complete_name, source.name)
            else:
                source.complete_name = source.name
