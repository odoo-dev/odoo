# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import re

from odoo import models, fields, api, _
from odoo.exceptions import UserError, RedirectWarning
from odoo.addons.rating.models.rating_data import OPERATOR_MAPPING

PROJECT_TASK_READABLE_FIELDS = {
    'allow_timesheets',
    'analytic_account_active',
    'effective_hours',
    'encode_uom_in_days',
    'hours_allocated',
    'progress',
    'overtime',
    'remaining_hours',
    'subtask_effective_hours',
    'subtask_allocated_hours',
    'timesheet_ids',
    'total_hours_spent',
}

class Task(models.Model):
    _name = "project.task"
    _inherit = "project.task"

    project_id = fields.Many2one(domain=[('is_internal_project', '=', False)])
    analytic_account_active = fields.Boolean("Active Analytic Account", compute='_compute_analytic_account_active', compute_sudo=True)
    allow_timesheets = fields.Boolean("Allow timesheets", related='project_id.allow_timesheets', help="Timesheets can be logged on this task.", readonly=True)
    remaining_hours = fields.Float("Remaining Hours", compute='_compute_remaining_hours', store=True, readonly=True, help="Number of allocated hours minus the number of hours spent.")
    remaining_hours_percentage = fields.Float(compute='_compute_remaining_hours_percentage', search='_search_remaining_hours_percentage')
    effective_hours = fields.Float("Hours Spent", compute='_compute_effective_hours', compute_sudo=True, store=True)
    total_hours_spent = fields.Float("Total Hours", compute='_compute_total_hours_spent', store=True, help="Time spent on this task and its sub-tasks (and their own sub-tasks).")
    progress = fields.Float("Progress", compute='_compute_progress_hours', store=True, group_operator="avg")
    overtime = fields.Float(compute='_compute_progress_hours', store=True)
    subtask_effective_hours = fields.Float("Hours Spent on Sub-Tasks", compute='_compute_subtask_effective_hours', recursive=True, store=True, help="Time spent on the sub-tasks (and their own sub-tasks) of this task.")
    timesheet_ids = fields.One2many('account.analytic.line', 'task_id', 'Timesheets')
    encode_uom_in_days = fields.Boolean(compute='_compute_encode_uom_in_days', default=lambda self: self._uom_in_days())
    display_name = fields.Char(help="""Use these keywords in the title to set new tasks:\n
        30h Allocate 30 hours to the task
        #tags Set tags on the task
        @user Assign the task to a user
        ! Set the task a high priority\n
        Make sure to use the right format and order e.g. Improve the configuration screen 5h #feature #v16 @Mitchell !""",
    )
    @property
    def SELF_READABLE_FIELDS(self):
        return super().SELF_READABLE_FIELDS | PROJECT_TASK_READABLE_FIELDS

    def _uom_in_days(self):
        return self.env.company.timesheet_encode_uom_id == self.env.ref('uom.product_uom_day')

    def _compute_encode_uom_in_days(self):
        self.encode_uom_in_days = self._uom_in_days()

    @api.depends('analytic_account_id.active', 'project_id.analytic_account_id.active')
    def _compute_analytic_account_active(self):
        """ Overridden in sale_timesheet """
        for task in self:
            task.analytic_account_active = task._get_task_analytic_account_id().active

    @api.depends('timesheet_ids.unit_amount')
    def _compute_effective_hours(self):
        if not any(self._ids):
            for task in self:
                task.effective_hours = round(sum(task.timesheet_ids.mapped('unit_amount')), 2)
            return
        timesheet_read_group = self.env['account.analytic.line']._read_group([('task_id', 'in', self.ids)], ['task_id'], ['unit_amount:sum'])
        timesheets_per_task = {task.id: amount for task, amount in timesheet_read_group}
        for task in self:
            task.effective_hours = round(timesheets_per_task.get(task.id, 0.0), 2)

    @api.depends('effective_hours', 'subtask_effective_hours', 'hours_allocated')
    def _compute_progress_hours(self):
        for task in self:
            if (task.hours_allocated > 0.0):
                task_total_hours = task.effective_hours + task.subtask_effective_hours
                task.overtime = max(task_total_hours - task.hours_allocated, 0)
                task.progress = round(100.0 * task_total_hours / task.hours_allocated, 2)
            else:
                task.progress = 0.0
                task.overtime = 0

    @api.depends('hours_allocated', 'remaining_hours')
    def _compute_remaining_hours_percentage(self):
        for task in self:
            if task.hours_allocated > 0.0:
                task.remaining_hours_percentage = task.remaining_hours / task.hours_allocated
            else:
                task.remaining_hours_percentage = 0.0

    def _search_remaining_hours_percentage(self, operator, value):
        if operator not in OPERATOR_MAPPING:
            raise NotImplementedError(_('This operator %s is not supported in this search method.', operator))
        query = f"""
            SELECT id
              FROM {self._table}
             WHERE remaining_hours > 0
               AND hours_allocated > 0
               AND remaining_hours / hours_allocated {operator} %s
            """
        return [('id', 'inselect', (query, (value,)))]

    @api.depends('effective_hours', 'subtask_effective_hours', 'hours_allocated')
    def _compute_remaining_hours(self):
        for task in self:
            task.remaining_hours = task.hours_allocated - task.effective_hours - task.subtask_effective_hours

    @api.depends('effective_hours', 'subtask_effective_hours')
    def _compute_total_hours_spent(self):
        for task in self:
            task.total_hours_spent = task.effective_hours + task.subtask_effective_hours

    @api.depends('child_ids.effective_hours', 'child_ids.subtask_effective_hours')
    def _compute_subtask_effective_hours(self):
        for task in self.with_context(active_test=False):
            task.subtask_effective_hours = sum(child_task.effective_hours + child_task.subtask_effective_hours for child_task in task.child_ids)

    def _get_group_pattern(self):
        return {
            **super()._get_group_pattern(),
            'hours_allocated': r'\s(\d+(?:\.\d+)?)[hH]',
        }

    def _get_groups_patterns(self):
        return ['(?:%s)*' % self._get_group_pattern()['hours_allocated']] + super()._get_groups_patterns()

    def _get_cannot_start_with_patterns(self):
        return super()._get_cannot_start_with_patterns() + [r'(?!\d+(?:\.\d+)?(?:h|H))']

    def _extract_allocated_hours(self):
        allocated_hours_group = self._get_group_pattern()['hours_allocated']
        if self.allow_timesheets:
            self.hours_allocated = sum(float(num) for num in re.findall(allocated_hours_group, self.display_name))
            self.display_name, dummy = re.subn(allocated_hours_group, '', self.display_name)

    def _get_groups(self):
        return [lambda task: task._extract_allocated_hours()] + super()._get_groups()

    def action_view_subtask_timesheet(self):
        self.ensure_one()
        task_ids = self.with_context(active_test=False)._get_subtask_ids_per_task_id().get(self.id, [])
        action = self.env["ir.actions.actions"]._for_xml_id("hr_timesheet.timesheet_action_all")
        graph_view_id = self.env.ref("hr_timesheet.view_hr_timesheet_line_graph_by_employee").id
        new_views = []
        for view in action['views']:
            if view[1] == 'graph':
                view = (graph_view_id, 'graph')
            new_views.insert(0, view) if view[1] == 'tree' else new_views.append(view)
        action.update({
            'display_name': _('Timesheets'),
            'context': {'default_project_id': self.project_id.id, 'grid_range': 'week'},
            'domain': [('project_id', '!=', False), ('task_id', 'in', task_ids)],
            'views': new_views,
        })
        return action

    def _get_timesheet(self):
        # Is override in sale_timesheet
        return self.timesheet_ids

    def write(self, values):
        # a timesheet must have an analytic account (and a project)
        if 'project_id' in values and not values.get('project_id') and self._get_timesheet():
            raise UserError(_('This task must be part of a project because there are some timesheets linked to it.'))
        res = super(Task, self).write(values)

        if 'project_id' in values:
            project = self.env['project.project'].browse(values.get('project_id'))
            if project.allow_timesheets:
                # We write on all non yet invoiced timesheet the new project_id (if project allow timesheet)
                self._get_timesheet().write({'project_id': values.get('project_id')})

        return res

    def name_get(self):
        if self.env.context.get('hr_timesheet_display_remaining_hours'):
            name_mapping = dict(super().name_get())
            for task in self:
                if task.allow_timesheets and task.hours_allocated > 0 and task.encode_uom_in_days:
                    days_left = _("(%s days remaining)") % task._convert_hours_to_days(task.remaining_hours)
                    name_mapping[task.id] = name_mapping.get(task.id, '') + u"\u00A0" + days_left
                elif task.allow_timesheets and task.hours_allocated > 0:
                    hours, mins = (str(int(duration)).rjust(2, '0') for duration in divmod(abs(task.remaining_hours) * 60, 60))
                    hours_left = _(
                        "(%(sign)s%(hours)s:%(minutes)s remaining)",
                        sign='-' if task.remaining_hours < 0 else '',
                        hours=hours,
                        minutes=mins,
                    )
                    name_mapping[task.id] = name_mapping.get(task.id, '') + u"\u00A0" + hours_left
            return list(name_mapping.items())
        return super().name_get()

    @api.model
    def _get_view_cache_key(self, view_id=None, view_type='form', **options):
        """The override of _get_view changing the time field labels according to the company timesheet encoding UOM
        makes the view cache dependent on the company timesheet encoding uom"""
        key = super()._get_view_cache_key(view_id, view_type, **options)
        return key + (self.env.company.timesheet_encode_uom_id,)

    @api.model
    def _get_view(self, view_id=None, view_type='form', **options):
        """ Set the correct label for `unit_amount`, depending on company UoM """
        arch, view = super()._get_view(view_id, view_type, **options)
        # Use of sudo as the portal user doesn't have access to uom
        arch = self.env['account.analytic.line'].sudo()._apply_timesheet_label(arch)

        if view_type in ['tree', 'pivot', 'graph', 'form'] and self.env.company.timesheet_encode_uom_id == self.env.ref('uom.product_uom_day'):
            arch = self.env['account.analytic.line']._apply_time_label(arch, related_model=self._name)

        return arch, view

    @api.ondelete(at_uninstall=False)
    def _unlink_except_contains_entries(self):
        """
        If some tasks to unlink have some timesheets entries, these
        timesheets entries must be unlinked first.
        In this case, a warning message is displayed through a RedirectWarning
        and allows the user to see timesheets entries to unlink.
        """
        timesheet_data = self.env['account.analytic.line'].sudo()._read_group(
            [('task_id', 'in', self.ids)],
            ['task_id'],
        )
        task_with_timesheets_ids = [task.id for task, in timesheet_data]
        if task_with_timesheets_ids:
            if len(task_with_timesheets_ids) > 1:
                warning_msg = _("These tasks have some timesheet entries referencing them. Before removing these tasks, you have to remove these timesheet entries.")
            else:
                warning_msg = _("This task has some timesheet entries referencing it. Before removing this task, you have to remove these timesheet entries.")
            raise RedirectWarning(
                warning_msg, self.env.ref('hr_timesheet.timesheet_action_task').id,
                _('See timesheet entries'), {'active_ids': task_with_timesheets_ids})

    @api.model
    def _convert_hours_to_days(self, time):
        uom_hour = self.env.ref('uom.product_uom_hour')
        uom_day = self.env.ref('uom.product_uom_day')
        return round(uom_hour._compute_quantity(time, uom_day, raise_if_failure=False), 2)
