from odoo import api, fields, models


class TestOrmBug(models.Model):
    _name = 'test_orm.bug'
    _description = 'a bug orm'

    a = fields.Integer()
    b = fields.Integer(compute='_compute_b')
    line_ids = fields.One2many(comodel_name='test_orm.bug.line', inverse_name='parent_id')

    @api.depends('a', 'line_ids.d')
    def _compute_b(self):
        self.b = self.a + sum(self.line_ids.mapped('c'))


class TestOrmBugLine(models.Model):
    _name = 'test_orm.bug.line'
    _description = 'a bug orm line'

    parent_id = fields.Many2one(comodel_name='test_orm.bug')
    c = fields.Integer()
    d = fields.Integer(compute='_compute_d', store=True)

    @api.depends('parent_id.a', 'c')
    def _compute_d(self):
        self.d = self.c + self.parent_id.a
