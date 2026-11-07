# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    _hr_timesheet_attendance__menu_hr_timesheet_attendance_report = models.Ref(
        'hr_timesheet_attendance.menu_hr_timesheet_attendance_report', 'ir.ui.menu', required=False)

    def _load_menus_blacklist(self):
        res = super()._load_menus_blacklist()
        if not self.env.user.has_group('hr_timesheet.group_hr_timesheet_user') and (att_menu := self._hr_timesheet_attendance__menu_hr_timesheet_attendance_report):
            res.append(att_menu.id)
        return res
