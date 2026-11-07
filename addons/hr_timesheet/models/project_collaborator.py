# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models


class ProjectCollaborator(models.Model):
    _inherit = 'project.collaborator'

    _hr_timesheet__timesheet_line_rule_portal_user = models.Ref('hr_timesheet.timesheet_line_rule_portal_user', 'ir.access')

    @api.model
    def _toggle_project_sharing_portal_rules(self, active):
        super()._toggle_project_sharing_portal_rules(active)
        # ir.access
        timesheet_portal_ir_rule = self._hr_timesheet__timesheet_line_rule_portal_user.sudo()
        if timesheet_portal_ir_rule.active != active:
            timesheet_portal_ir_rule.write({'active': active})
