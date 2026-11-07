# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    _hr_timesheet__timesheet_menu_activity_user = models.Ref('hr_timesheet.timesheet_menu_activity_user', 'ir.ui.menu', required=False)

    def _load_menus_blacklist(self):
        res = super()._load_menus_blacklist()
        if self.env.user.has_group('hr_timesheet.group_hr_timesheet_approver') and (time_menu := self._hr_timesheet__timesheet_menu_activity_user):
            res.append(time_menu.id)
        return res
