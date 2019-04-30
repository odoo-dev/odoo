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
    line_ids = fields.One2many('test.line', 'test_id')

    int1 = fields.Integer('User', default=lambda x: 1)
    intx2 = fields.Integer('User', compute="_get_intx2", inverse='_set_intx2', store=True)

    line_sum = fields.Integer('Sum Currency', compute='_line_sum', store=True)

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
        print('* end')
        self.recompute()
        if hasattr(self, 'towrite_flush'):
            self.towrite_flush()
        self.env['test.line'].search([('intx2', '=', 3)])
        return time.time()-t

    def test(self):
        def log(record):
            print(record.name, record.id, ':', record.int1, record.line_sum)
            for line in record.line_ids:
                print('    ', line.name, line.id, ':', line.name2, line.intx2, line.test_id)

        main = self.create({
            'name': 'main',
            'line_ids': [
                (0,0, {'name': 'abc'}),
                (0,0, {'name': 'def'}),
                (0,0, {'name': 'ghi'}),
            ]
        })
        second = self.create({
            'name': 'second'
        })
        main.int1 = 10

        line  = main.line_ids[1]
        line.test_id = second

        log(main)
        log(second)

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


