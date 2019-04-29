# -*- coding: utf-8 -*-

from odoo import models, fields, api
import time

class test(models.Model):
    _name = 'test'
    _log_access = False

    name = fields.Char()
    line_ids = fields.One2many('test.line', 'test_id')

    int1 = fields.Integer('User', default=lambda x: 1)
    intx2 = fields.Integer('User', compute="_get_intx2", store=True)

    line_sum = fields.Integer('Sum Currency', compute='_line_sum', store=True)

    def pcache(self):
        print('------ Cache ----')
        for dd in self.env.cache._data.values():
            for field, ids in dd.items():
                for rid, value in ids.items():
                    print(field.model_name, rid,':', field.name,'=', value)
        print('')
        print('----- Todo -----')
        for field in self.env.all.todo:
            print(field, self.env.all.todo[field])
        print('')


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
        return time.time()-t

    def testme3(self):
        t = time.time()
        main_id = self.create({
            'name': 'bla',
            'line_ids': [
                (0,0, {'name': 'abc'}),
                (0,0, {'name': 'def'}),
            ]
        })
        main_id.int1 = 5
        self.env['test.line'].create(
            {'name': 'ghi', 'test_id': main_id.id}
        )
        self.env['test.line'].search([('intx2', '=', 3)])
        self.recompute()
        return time.time()-t

    def test(self):
        model_res_partner = self.env.ref('base.model_res_partner')
        group_user = self.env.ref('base.group_user')
        user_demo = self.env.ref('base.user_demo')

        # create an ir_rule for the Employee group with an blank domain

        data = {
            'name': 'test_rule2',
            'model_id': model_res_partner.id,
            'domain_force': "[('id','=',False),('name','=',False)]",
            'groups': [(6, 0, group_user.ids)],
        }
        import pudb
        pudb.set_trace()

        rule2 = self.env['ir.rule'].create(data)
        print(rule2.groups)
        # r = self.env['ir.rule']._compute_domain("res.partner", "read")
        # print('* domain after 1: ', r)
        # rule1 = self.env['ir.rule'].create({
        #     'name': 'test_rule1',
        #     'model_id': model_res_partner.id,
        #     'domain_force': "[('id','>',1)]",
        #     'groups': [(6, 0, group_user.ids)],
        # })


        # r = self.env['ir.rule']._compute_domain("res.partner", "read")
        # print('* domain', r)

        crash_here_to_rollback


class test_line(models.Model):
    _name = 'test.line'

    name = fields.Char()
    test_id = fields.Many2one('test')
    intx2   = fields.Integer(compute='_get_intx2', store=True)

    @api.depends('test_id.intx2')
    def _get_intx2(self):
        for record in self:
            record.intx2 = record.test_id.intx2


