# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    _hr__menu_view_hr_job = models.Ref('hr.menu_view_hr_job', 'ir.ui.menu', required=False)
    _hr_recruitment__menu_hr_job_position = models.Ref('hr_recruitment.menu_hr_job_position', 'ir.ui.menu', required=False)
    _hr_recruitment__menu_hr_job_position_interviewer = models.Ref('hr_recruitment.menu_hr_job_position_interviewer', 'ir.ui.menu', required=False)

    def _load_menus_blacklist(self):
        res = super()._load_menus_blacklist()
        is_interviewer = self.env.user.has_group('hr_recruitment.group_hr_recruitment_interviewer')
        if not is_interviewer and (job_menu := self._hr__menu_view_hr_job):
            res.append(job_menu.id)
        elif (
            is_interviewer
            and not self.env.user.has_group('hr_recruitment.group_hr_recruitment_user')
            and (pos_menu := self._hr_recruitment__menu_hr_job_position)
        ):
            res.append(pos_menu.id)
        elif int_menu := self._hr_recruitment__menu_hr_job_position_interviewer:
            res.append(int_menu.id)
        return res
