# -*- coding: utf-8 -*-
from odoo import fields, models


class GroupOnDate(models.Model):
    _name = 'test_read_group.on_date'
    _description = 'Group Test Read On Date'

    date = fields.Date("Date")
    value = fields.Integer("Value")


class BooleanAggregate(models.Model):
    _name = 'test_read_group.aggregate.boolean'
    _description = 'Group Test Read Boolean Aggregate'
    _order = 'key DESC'

    key = fields.Integer()
    bool_and = fields.Boolean(default=False, group_operator='bool_and')
    bool_or = fields.Boolean(default=False, group_operator='bool_or')
    bool_array = fields.Boolean(default=False, group_operator='array_agg')


class Aggregate(models.Model):
    _name = 'test_read_group.aggregate'
    _order = 'id'
    _description = 'Group Test Aggregate'

    key = fields.Integer()
    value = fields.Integer("Value")
    partner_id = fields.Many2one('res.partner')


class GroupOnSelection(models.Model):
    _name = 'test_read_group.on_selection'
    _description = 'Group Test Read On Selection'

    state = fields.Selection([('a', "A"), ('b', "B")], group_expand='_expand_states')
    value = fields.Integer()

    def _expand_states(self, states, domain, order):
        # return all possible states, in order
        return [key for key, val in type(self).state.selection]


class FillTemporal(models.Model):
    _name = 'test_read_group.fill_temporal'
    _description = 'Group Test Fill Temporal'

    date = fields.Date()
    datetime = fields.Datetime()
    value = fields.Integer()


class Order(models.Model):
    _name = 'test_read_group.order'
    _description = 'Sales order'

    line_ids = fields.One2many('test_read_group.order.line', 'order_id')


class OrderLine(models.Model):
    _name = 'test_read_group.order.line'
    _description = 'Sales order line'

    order_id = fields.Many2one('test_read_group.order', ondelete='cascade')
    value = fields.Integer()


class Related1(models.Model):
    _name = 'test_read_group.related1'
    _description = 'related1'

    partner_id = fields.Many2one('res.partner', required=True)
    country_code = fields.Char(related='partner_id.country_id.code')


class Related2(models.Model):
    _name = 'test_read_group.related2'
    _description = 'related2'

    related1_id = fields.Many2one('test_read_group.related1', delegate=True, required=True)
    state_id = fields.Many2one('res.country.state', related='partner_id.state_id')
    state_stored_id = fields.Many2one('res.country.state', related='partner_id.state_id', store=True, string='State (stored)')
    country_code2 = fields.Char(related='partner_id.country_id.code', string='Country Code 2')
    partner_city = fields.Char(related='partner_id.city')


class Related3(models.Model):
    _name = 'test_read_group.related3'
    _description = 'related3'

    related2_id = fields.Many2one('test_read_group.related2', delegate=True, required=True)
    state_code = fields.Char(related='partner_id.state_id.code', string='State Code')
    state_code2 = fields.Char(related='state_id.code', string='State Code2')
    state_stored_code = fields.Char(related='state_stored_id.code', string='State Code (stored)')
