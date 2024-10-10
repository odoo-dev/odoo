# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class Test_Access_RightSome_Obj(models.Model):
    _description = 'Object For Test Access Right'

    val = fields.Integer()
    categ_id = fields.Many2one('test_access_right.obj_categ')
    parent_id = fields.Many2one('test_access_right.some_obj')
    company_id = fields.Many2one('res.company')
    forbidden = fields.Integer(
        groups='test_access_rights.test_group,base.group_portal',
        default=5
    )
    forbidden2 = fields.Integer(groups='test_access_rights.test_group')
    forbidden3 = fields.Integer(groups=fields.NO_ACCESS)


class Test_Access_RightContainer(models.Model):
    _description = 'Test Access Right Container'

    some_ids = fields.Many2many('test_access_right.some_obj', 'test_access_right_rel', 'container_id', 'some_id')


class Test_Access_RightInherits(models.Model):
    _description = 'Object for testing related access rights'

    _inherits = {'test_access_right.some_obj': 'some_id'}

    some_id = fields.Many2one('test_access_right.some_obj', required=True, ondelete='restrict')


class Test_Access_RightChild(models.Model):
    _description = 'Object for testing company ir rule'

    parent_id = fields.Many2one('test_access_right.some_obj')


class Test_Access_RightObj_Categ(models.Model):
    _description = "Context dependent searchable model"

    name = fields.Char(required=True)

    @api.model
    def search_fetch(self, domain, field_names, offset=0, limit=None, order=None):
        if self.env.context.get('only_media'):
            domain += [('name', '=', 'Media')]
        return super().search_fetch(domain, field_names, offset, limit, order)


class Test_Access_RightTicket(models.Model):
    """We want to simulate a record that would typically be accessed by a portal user,
       with a relational field to records that could not be accessed by a portal user.
    """
    _description = 'Fake ticket For Test Access Right'

    name = fields.Char()
    message_partner_ids = fields.Many2many(comodel_name='res.partner')


class ResPartner(models.Model):
    """User inherits partner, so we are implicitly adding these fields to User
       This essentially reproduces the (sad) situation introduced by account.
    """
    _inherit = ['res.partner']

    currency_id = fields.Many2one('res.currency', compute='_get_company_currency', readonly=True)
    monetary = fields.Monetary()  # implicitly depends on currency_id as currency_field

    def _get_company_currency(self):
        for partner in self:
            partner.currency_id = partner.sudo().company_id.currency_id
