# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class AccountAnalyticLine(models.Model):
    _inherit = 'account.analytic.line'

    holiday_id = fields.Many2one("hr.leave", string='Leave Request')
    global_leave_id = fields.Many2one("resource.calendar.leaves", string="Global Time Off")

    @api.ondelete(at_uninstall=False)
    def _unlink_except_linked_leave(self):
        if any(line.holiday_id or line.global_leave_id for line in self):
            raise UserError(_('You cannot delete timesheet lines attached to a leaves. Please cancel the leaves instead.'))
