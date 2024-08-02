# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class Test_PerformanceBase(models.Model):
    _description = 'Test Performance Base'

    name = fields.Char()
    value = fields.Integer(default=0)
    value_pc = fields.Float(compute="_value_pc", store=True)
    value_ctx = fields.Float(compute="_value_ctx")
    computed_value = fields.Float(compute="_computed_value")
    indirect_computed_value = fields.Float(compute="_indirect_computed_value")
    partner_id = fields.Many2one('res.partner', string='Customer')

    line_ids = fields.One2many('test_performance.line', 'base_id')
    total = fields.Integer(compute="_total", store=True)
    tag_ids = fields.Many2many('test_performance.tag')

    @api.depends('value')
    def _value_pc(self):
        for record in self:
            record.value_pc = float(record.value) / 100

    @api.depends('value')
    def _computed_value(self):
        for record in self:
            record.computed_value = float(record.value) / 100

    @api.depends('computed_value')
    def _indirect_computed_value(self):
        for record in self:
            record.indirect_computed_value = record.computed_value / 100

    @api.depends_context('key')
    def _value_ctx(self):
        self.env.cr.execute('SELECT 42')  # one dummy query per batch
        for record in self:
            record.value_ctx = self.env.context.get('key')

    @api.depends('line_ids.value')
    def _total(self):
        for record in self:
            record.total = sum(line.value for line in record.line_ids)


class Test_PerformanceLine(models.Model):
    _description = 'Test Performance Line'

    base_id = fields.Many2one('test_performance.base', required=True, ondelete='cascade')
    value = fields.Integer()

    _sql_constraints = [
        ('line_uniq', 'UNIQUE INDEX (base_id, value)', "base_id and value should be unique"),
    ]


class Test_PerformanceTag(models.Model):
    _description = 'Test Performance Tag'

    name = fields.Char()


class Test_PerformanceBacon(models.Model):
    _description = 'Test Performance Bacon'

    property_eggs = fields.Many2one(
        'test_performance.eggs', company_dependent=True, string='Eggs')


class Test_PerformanceEggs(models.Model):
    _description = 'Test Performance Eggs'

    name = fields.Char()


class Test_PerformanceMozzarella(models.Model):
    _description = 'Test Performance Mozzarella'

    value = fields.Integer(default=0, required=True)
    value_plus_one = fields.Integer(compute="_value_plus_one", required=True, store=True)
    value_null_by_default = fields.Integer()

    @api.depends('value')
    def _value_plus_one(self):
        for record in self:
            record.value_plus_one = record.value + 1


class Test_PerformanceSimpleMinded(models.Model):
    _description = 'test_performance.simple.minded'

    name = fields.Char()
    active = fields.Boolean(default=True)
    parent_id = fields.Many2one('test_performance.simple.minded')

    child_ids = fields.One2many('test_performance.simple.minded', 'parent_id')
