# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict

from odoo import api, fields, models, _


class AccountAnalyticAccount(models.Model):
    _inherit = 'account.analytic.account'
    _description = 'Analytic Account'

    production_ids = fields.Many2many('mrp.production')
    production_count = fields.Integer("Manufacturing Orders Count", compute='_compute_production_count')
    bom_ids = fields.Many2many('mrp.bom', compute='_compute_bom_ids')
    bom_count = fields.Integer("BoM Count", compute='_compute_bom_count')
    workcenter_ids = fields.Many2many('mrp.workcenter')
    workorder_count = fields.Integer("Work Order Count", compute='_compute_workorder_count')

    @api.depends('production_ids')
    def _compute_production_count(self):
        for account in self:
            account.production_count = len(account.production_ids)

    def _compute_bom_ids(self):
        boms = self.env['mrp.bom'].search([])
        bom_by_account = defaultdict(lambda: self.env['mrp.bom'])
        for bom in boms:
            for account in bom.analytic_account_ids:
                bom_by_account[account] |= bom
        for account in self:
            account.bom_ids = bom_by_account[account].ids

    @api.depends('bom_ids')
    def _compute_bom_count(self):
        for account in self:
            account.bom_count = len(account.bom_ids)

    @api.depends('workcenter_ids.order_ids', 'production_ids.workorder_ids')
    def _compute_workorder_count(self):
        for account in self:
            account.workorder_count = len(account.workcenter_ids.order_ids | account.production_ids.workorder_ids)

    def action_view_mrp_production(self):
        self.ensure_one()
        result = {
            "type": "ir.actions.act_window",
            "res_model": "mrp.production",
            "domain": [['id', 'in', self.production_ids.ids]],
            "name": _("Manufacturing Orders"),
            'view_mode': 'tree,form',
            "context": {'default_analytic_account_id': self.id},
        }
        if len(self.production_ids) == 1:
            result['view_mode'] = 'form'
            result['res_id'] = self.production_ids.id
        return result

    def action_view_mrp_bom(self):
        self.ensure_one()
        result = {
            "type": "ir.actions.act_window",
            "res_model": "mrp.bom",
            "domain": [['id', 'in', self.bom_ids.ids]],
            "name": _("Bills of Materials"),
            'view_mode': 'tree,form',
            "context": {'default_analytic_account_id': self.id},
        }
        if self.bom_count == 1:
            result['view_mode'] = 'form'
            result['res_id'] = self.bom_ids.id
        return result

    def action_view_workorder(self):
        self.ensure_one()
        result = {
            "type": "ir.actions.act_window",
            "res_model": "mrp.workorder",
            "domain": [['id', 'in', (self.workcenter_ids.order_ids | self.production_ids.workorder_ids).ids]],
            "context": {"create": False},
            "name": _("Work Orders"),
            'view_mode': 'tree',
        }
        return result


class AccountAnalyticLine(models.Model):
    _inherit = 'account.analytic.line'

    category = fields.Selection(selection_add=[('manufacturing_order', 'Manufacturing Order')])

class AccountAnalyticApplicability(models.Model):
    _inherit = 'account.analytic.applicability'
    _description = "Analytic Plan's Applicabilities"

    business_domain = fields.Selection(
        selection_add=[
            ('manufacturing_order', 'Manufacturing Order'),
        ],
        ondelete={'manufacturing_order': 'cascade'},
    )
