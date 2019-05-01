# -*- coding: utf-8 -*-

from odoo import models, fields, api
import time

class test(models.Model):
    """
        test object
    """
    _name = 'test'
    _log_access = False

    name = fields.Char()
    parent_id = fields.Many2one('test')
    dname = fields.Char(compute="_get_dname", store=True)
    line_ids = fields.One2many('test.line', 'test_id')
    booltest = fields.Boolean('Is False')    # test that postgresql values for boolean is False

    int1 = fields.Integer('User', default=lambda x: 1)
    intx2 = fields.Integer('User', compute="_get_intx2", inverse='_set_intx2', store=True)

    line_sum = fields.Integer('Sum Currency', compute='_line_sum', store=True)

    @api.depends('name', 'parent_id.dname')
    def _get_dname(self):
        for record in self:
            if record.parent_id:
                record.dname = record.name + ' / ' +record.parent_id.dname
            else:
                record.dname = record.name

    @api.depends('line_ids.intx2')
    def _line_sum(self):
        for record in self:
            total = 0
            for line in record.line_ids:
                total += line.intx2
            record.line_sum = total

    @api.depends('int1')
    def _get_intx2(self):
        for record in self:
            record.intx2 = record.int1 * 2

    def _set_intx2(self):
        for record in self:
            record.int1 = record.intx2 // 2

    def testme(self):
        t = time.time()
        for partner in self.env['res.partner'].search([]):
            partner.country_id.name
        return time.time()-t

    def testme2(self):
        t = time.time()
        main_id = self.create({
            'name': 'bla',
            'line_ids': [
                (0,0, {'name': 'abc'}),
                (0,0, {'name': 'def'}),
            ]
        })
        self.recompute()
        if hasattr(self, 'towrite_flush'):
            self.towrite_flush()
        return time.time()-t

    def testme3(self):
        t = time.time()
        print('* Create with two lines')
        main = self.create({
            'name': 'bla',
            'line_ids': [
                (0,0, {'name': 'abc'}),
                (0,0, {'name': 'def'}),
            ]
        })
        print('* main.int1 = 5')
        main.int1 = 5
        print('* main.intx2 = 8')
        main.intx2 = 8
        print('* create_line')
        self.env['test.line'].create(
            {'name': 'ghi', 'test_id': main.id}
        )
        print('* search intx2 line')
        self.env['test.line'].search([('intx2', '=', 3)])
        print('* end')
        self.recompute()
        if hasattr(self, 'towrite_flush'):
            self.towrite_flush()
        return time.time()-t

    def test(self):
        main = self.create({
            'name': 'main',
        })
        second = self.create({
            'name': 'second',
            'parent_id': main.id,
        })
        third = self.create({
            'name': 'third',
            'parent_id': second.id,
        })
        second.parent_id = False
        main.parent_id = third.id

        import pudb
        pudb.set_trace()

        self.recompute()

        for x in (main, second, third):
            print(x.name, ':', x.dname)

        crash_here_to_rollback


class test_line(models.Model):
    """
        test line
    """
    _name = 'test.line'

    name = fields.Char()
    name2 = fields.Char('Related Name', related='test_id.name', store=True)

    test_id = fields.Many2one('test')
    intx2   = fields.Integer(compute='_get_intx2', store=True)

    @api.depends('test_id.intx2')
    def _get_intx2(self):
        for record in self:
            record.intx2 = record.test_id.intx2


