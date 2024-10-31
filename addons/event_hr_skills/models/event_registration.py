# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class EventRegistration(models.Model):
    _inherit = 'event.registration'

    resume_line_ids = fields.One2many('hr.resume.line', 'event_registration_id', compute='_compute_resume_line_ids', store=True)

    def _show_on_resume(self):
        self.ensure_one()
        return (
            self.state == 'done'
            and any(self.event_id.tag_ids.category_id.mapped('show_on_resume'))
        )

    def _get_resume_lines_vals(self, employee):
        self.ensure_one()
        return {
            'employee_id': employee.id,
            'event_registration_id': self.id,
            'event_id': self.event_id.id,
            'name': self.event_id.name,
            'date_start': self.event_id.date_begin,
            'date_end': self.event_id.date_end,
            'description': self.event_id.description,
            'line_type_id': self.env.ref('event_hr_skills.resume_type_events').id,
        }

    def _regenerate_resume_lines(self):
        create_vals_list = []
        lines_to_unlink = self.env['hr.resume.line']
        for registration in self:

            if not registration._show_on_resume():
                lines_to_unlink |= registration.resume_line_ids
                continue
            lines_to_unlink |= registration.resume_line_ids.filtered(
                lambda line: line.employee_id not in registration.partner_id.employee_ids
            )

            if self.env.context.get('no_create_resume_lines'):
                continue
            create_vals_list.extend([
                registration._get_resume_lines_vals(employee)
                for employee in registration.partner_id.employee_ids.filtered(
                    lambda emp: emp not in registration.resume_line_ids.employee_id
                )
            ])

        lines_to_unlink.unlink()
        if create_vals_list:
            self.env['hr.resume.line'].create(create_vals_list)

    @api.depends('partner_id.employee_ids', 'event_id.tag_ids.category_id.show_on_resume')
    def _compute_resume_line_ids(self):
        self._regenerate_resume_lines()

    def write(self, vals):
        ret = super().write(vals)
        if 'state' in vals:
            self._regenerate_resume_lines()
        return ret
