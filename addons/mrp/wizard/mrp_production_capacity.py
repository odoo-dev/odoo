# Part of Odoo. See LICENSE file for full copyright and licensing details.

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.exceptions import AccessError
from odoo.fields import Domain


class MrpProductionCapacity(models.TransientModel):
    _name = 'mrp.production.capacity'
    _description = "Weekly Production Capacity"

    REFERENCE_WEEKS = 4

    company_id = fields.Many2one('res.company', required=True, default=lambda self: self.env.company)
    weekly_capacity = fields.Float(
        "Weekly Capacity", digits=(16, 2),
        default=lambda self: self.env.company._get_mrp_weekly_capacity(),
        help="Number of working hours available each week to process the manufacturing orders.")
    weekly_average_output = fields.Float(
        "Weekly Average Output", compute='_compute_weekly_average_output', digits=(16, 2),
        help="Actual duration of the work orders completed in the last 4 weeks, per week (in hours).")

    @api.depends('company_id')
    def _compute_weekly_average_output(self):
        for wizard in self:
            workorders = self.env['mrp.workorder'].search(wizard._get_reference_workorders_domain())
            wizard.weekly_average_output = sum(workorders.mapped('duration')) / 60 / self.REFERENCE_WEEKS

    def _get_reference_workorders_domain(self):
        self.ensure_one()
        return Domain([
            ('company_id', '=', self.company_id.id),
            ('state', '=', 'done'),
            ('date_finished', '>=', fields.Datetime.now() - relativedelta(weeks=self.REFERENCE_WEEKS)),
        ])

    def action_save(self):
        self.ensure_one()
        if not self.env.user.has_group('mrp.group_mrp_manager'):
            raise AccessError(self.env._("Only manufacturing administrators can set the weekly capacity."))
        self.company_id.sudo().mrp_weekly_capacity = self.weekly_capacity
        self.env['mrp.production']._schedule_productions(self.company_id)
        return {'type': 'ir.actions.act_window_close'}

    def action_view_details(self):
        self.ensure_one()
        action = self.env['ir.actions.act_window']._for_xml_id('mrp.mrp_workorder_report')
        action['domain'] = list(self._get_reference_workorders_domain())
        action['context'] = {'group_by': ['date_start:week'], 'graph_measure': 'duration'}
        return action
