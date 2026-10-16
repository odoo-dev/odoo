# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models, fields

from .hr_homeworking import DAYS


class ResUsers(models.Model):
    _inherit = 'res.users'

    monday_location_id = fields.Many2one("hr.work.location", related="employee_id.monday_location_id", readonly=False, string='Mondays')
    tuesday_location_id = fields.Many2one("hr.work.location", related="employee_id.tuesday_location_id", readonly=False, string='Tuesdays')
    wednesday_location_id = fields.Many2one("hr.work.location", related="employee_id.wednesday_location_id", readonly=False, string='Wednesdays')
    thursday_location_id = fields.Many2one("hr.work.location", related="employee_id.thursday_location_id", readonly=False, string='Thursdays')
    friday_location_id = fields.Many2one("hr.work.location", related="employee_id.friday_location_id", readonly=False, string='Fridays')
    saturday_location_id = fields.Many2one("hr.work.location", related="employee_id.saturday_location_id", readonly=False, string='Saturdays')
    sunday_location_id = fields.Many2one("hr.work.location", related="employee_id.sunday_location_id", readonly=False, string='Sundays')

    def _get_employee_fields_to_sync(self):
        return super()._get_employee_fields_to_sync() + DAYS

    @property
    def SELF_READABLE_FIELDS(self):
        return super().SELF_READABLE_FIELDS + DAYS

    @property
    def SELF_WRITEABLE_FIELDS(self):
        return super().SELF_WRITEABLE_FIELDS + DAYS

    def _compute_im_status(self):
        super()._compute_im_status()
        dayfield = self.env['hr.employee']._get_current_day_location_field()
        employee_by_user = self._get_im_status_employee_by_user()
        for user in self:
            location_type = employee_by_user[user][dayfield].location_type
            if not location_type:
                continue
            im_status = user.im_status
            if im_status in ["online", "away", "busy", "offline"]:
                user.im_status = location_type + "_" + im_status

    def _get_im_status_employee_by_user(self):
        # sudo: hr.employee - can read the work location of users to show their IM status
        users = self.sudo().with_context(active_test=True)
        # one status for every viewer: the employee of the user's company, else the newest one
        employee_by_user = {user: user.with_company(user.company_id).employee_id for user in users}
        if users_without_employee := users.filtered(lambda user: not employee_by_user[user]):
            employees = users.env["hr.employee"].search(
                [("user_id", "in", users_without_employee.ids)],
                order="id",
            )
            employee_by_user.update((employee.user_id, employee) for employee in employees)
        return employee_by_user
