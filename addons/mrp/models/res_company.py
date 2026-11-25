# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.fields import Command


class ResCompany(models.Model):
    _inherit = 'res.company'

    mrp_weekly_capacity = fields.Float(
        "Weekly Production Capacity", digits=(16, 2),
        help="Number of working hours available each week to process the manufacturing orders. "
             "When not set, the working hours of the company are used.")

    mrp_production_calendar_id = fields.Many2one(
        'resource.calendar', "Production Working Schedule",
        help="Working schedule used to schedule the manufacturing orders one after the other. "
             "Monday to Friday, 8 AM to 4 PM by default.")

    def _get_mrp_production_calendar(self):
        self.ensure_one()
        if not self.mrp_production_calendar_id:
            self.sudo().mrp_production_calendar_id = self.env['resource.calendar'].sudo().create({
                'name': self.env._("Manufacturing: Monday to Friday, 8 AM - 4 PM"),
                'company_id': self.id,
                'attendance_ids': [Command.clear()] + [
                    Command.create({'dayofweek': str(day), 'hour_from': 8, 'hour_to': 16})
                    for day in range(5)  # Monday to Friday
                ],
            })
        return self.mrp_production_calendar_id

    def _get_mrp_weekly_capacity(self):
        self.ensure_one()
        return self.mrp_weekly_capacity or self._get_mrp_production_calendar().hours_per_week

    def _create_unbuild_sequence(self):
        unbuild_vals = []
        for company in self:
            unbuild_vals.append({
                'name': 'Unbuild',
                'code': 'mrp.unbuild',
                'company_id': company.id,
                'prefix': 'UB/',
                'padding': 5,
                'number_next': 1,
                'number_increment': 1
            })
        if unbuild_vals:
            self.env['ir.sequence'].create(unbuild_vals)

    @api.model
    def create_missing_unbuild_sequences(self):
        company_ids  = self.env['res.company'].search([])
        company_has_unbuild_seq = self.env['ir.sequence'].search([('code', '=', 'mrp.unbuild')]).mapped('company_id')
        company_todo_sequence = company_ids - company_has_unbuild_seq
        company_todo_sequence._create_unbuild_sequence()

    def _create_per_company_sequences(self):
        super()._create_per_company_sequences()
        self._create_unbuild_sequence()
