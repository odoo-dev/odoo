# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    def _load_menus_blacklist(self):
        res = super()._load_menus_blacklist()
        is_interviewer = self.env.user.has_group('hr_recruitment.group_hr_recruitment_interviewer')
        if not is_interviewer:
            res.append(self.ref('hr.menu_view_hr_job').id)
        elif not self.env.user.has_group('hr_recruitment.group_hr_recruitment_user'):
            res.append(self.ref('hr_recruitment.menu_hr_job_position').id)
        else:
            res.append(self.ref('hr_recruitment.menu_hr_job_position_interviewer').id)
        return res
