# -*- coding: utf-8 -*-

from unittest.mock import patch

from dateutil.relativedelta import relativedelta

from odoo import fields
from odoo.addons.mail.tests.common import mail_new_test_user
from odoo.addons.mail.tools.discuss import Store
from odoo.tests import HttpCase, tagged

from odoo.addons.project.tests.test_project_sharing import TestProjectSharingCommon

@tagged('post_install', '-at_install')
class TestPortalTimesheet(TestProjectSharingCommon):

    def test_ensure_fields_view_get_access(self):
        """ Ensure that the method _fields_view_get is accessible without
            raising an error for all portal users
        """
        for view in ['form', 'list']:
            # Ensure that uom.uom records are not present in cache
            self.env.invalidate_all()
            # Should not raise any access error
            self.env['account.analytic.line'].with_user(self.user_portal).get_view(view_type=view)

    def test_action_view_subtask_timesheet(self):
        """ Ensure that the action view_subtask_timesheet is accessible without
            raising an error for all portal users
        """
        action = self.task_portal.action_view_subtask_timesheet()
        tree_view_id = form_view_id = kanban_view_id = False
        for view_id, view_type in action['views']:
            if view_type == 'list':
                tree_view_id = view_id
            elif view_type == 'form':
                form_view_id = view_id
            elif view_type == 'kanban':
                kanban_view_id = view_id

        action = self.task_portal.with_user(self.user_portal).action_view_subtask_timesheet()
        portal_tree_view_id = self.env['ir.model.data']._xmlid_to_res_id('hr_timesheet.hr_timesheet_line_portal_tree')
        portal_form_view_id = self.env['ir.model.data']._xmlid_to_res_id('hr_timesheet.timesheet_view_form_portal_user')
        portal_kanban_view_id = self.env['ir.model.data']._xmlid_to_res_id('hr_timesheet.view_kanban_account_analytic_line_portal_user')
        if portal_tree_view_id and portal_form_view_id and portal_kanban_view_id:
            # no need to check that if the views are not installed or already removed
            for view_id, view_type in action['views']:
                if view_type == 'list':
                    self.assertEqual(view_id, portal_tree_view_id)
                elif view_type == 'form':
                    self.assertEqual(view_id, portal_form_view_id)
                elif view_type == 'kanban':
                    self.assertEqual(view_id, portal_kanban_view_id)

            self.env['ir.ui.view'].browse([portal_tree_view_id, portal_form_view_id, portal_kanban_view_id]).unlink()

        action = self.task_portal.with_user(self.user_portal).action_view_subtask_timesheet()
        for view_id, view_type in action['views']:
            if view_type == 'list':
                self.assertEqual(view_id, tree_view_id)
            elif view_type == 'form':
                self.assertEqual(view_id, form_view_id)
            elif view_type == 'kanban':
                self.assertEqual(view_id, kanban_view_id)

    def test_timesheet_visibility_portal(self):
        """
        Steps:
        1. Retrieve the domain that determines timesheet visibility for the portal user.
        2. Create an employee linked to the project user.
        3. Create a timesheet entry associated with a specific project and task.
        4. Assign the portal user as the partner on the task.
        5. Search for timesheets using the retrieved domain.
        6. Verify that the created timesheet is visible to the portal user.
        7. Remove the portal user as the partner of the task.
        8. Search for timesheets again using the same domain.
        9. Verify that the timesheet is no longer visible to the portal user.
        10. Assign the portal user as the partner of the project.
        11. Search for timesheets again using the same domain.
        12. Verify that the timesheet is now visible to the portal user.
        """
        AnalyticLineModel = self.env['account.analytic.line']
        timesheet_domain = AnalyticLineModel.with_user(self.user_portal)._timesheet_get_portal_domain()

        employee = self.env['hr.employee'].create({
            'name': 'Project User Employee',
            'user_id': self.user_projectuser.id,
        })

        timesheet_entry = AnalyticLineModel.create({
            'name': 'Timesheet',
            'project_id': self.project_cows.id,
            'task_id': self.task_cow.id,
            'employee_id': employee.id,
        })

        self.task_cow.write({'partner_id': self.user_portal.partner_id.id})
        timesheets = AnalyticLineModel.search(timesheet_domain)
        self.assertIn(timesheet_entry.id, timesheets.ids, "Portal user should see the timesheet when set as the partner on the task.")

        self.task_cow.write({'partner_id': False})
        timesheets = AnalyticLineModel.search(timesheet_domain)
        self.assertNotIn(timesheet_entry.id, timesheets.ids, "Portal user should not see the timesheet when not assigned as the task's partner.")

        self.project_cows.write({'partner_id': self.user_portal.partner_id.id})
        timesheets = AnalyticLineModel.search(timesheet_domain)
        self.assertIn(timesheet_entry.id, timesheets.ids, "Portal user should see the timesheet when set as the project’s partner.")

    def test_portal_task_hours_no_double_counting(self):
        """ Test that totals for both allocated and spent hours are calculated correctly, preventing double-counting.

            Test Cases:
            1. Parent + all sub-tasks in same group -> Totals are based on the parent.
            2. Parent alone in group -> Totals are based on the parent's value.
            3. Sub-task alone in group -> Totals are based on the sub-task's value.
            4. Parent + distant sub-task in same group -> Totals are based on the parent.
        """

        parent_task = self.env['project.task'].create({
            'name': 'Parent Task',
            'project_id': self.project_portal.id,
            'allocated_hours': 500.0,
        })
        sub_task_1 = self.env['project.task'].create({
            'name': 'Sub-task 1',
            'project_id': self.project_portal.id,
            'parent_id': parent_task.id,
            'allocated_hours': 50.0,
        })
        sub_task_2 = self.env['project.task'].create({
            'name': 'Sub-task 2',
            'project_id': self.project_portal.id,
            'parent_id': sub_task_1.id,
            'allocated_hours': 25.0,
        })

        employee = self.env['hr.employee'].create({'name': 'Test Employee'})
        self.env['account.analytic.line'].create([
            {'name': 'Time on parent', 'project_id': self.project_portal.id, 'task_id': parent_task.id, 'unit_amount': 50, 'employee_id': employee.id},
            {'name': 'Time on sub-task 1', 'project_id': self.project_portal.id, 'task_id': sub_task_1.id, 'unit_amount': 25, 'employee_id': employee.id},
            {'name': 'Time on sub-task 2', 'project_id': self.project_portal.id, 'task_id': sub_task_2.id, 'unit_amount': 15, 'employee_id': employee.id},
        ])

        # Test Case 1: A group containing parent and its all sub-tasks
        group_with_all_tasks = parent_task | sub_task_1 | sub_task_2
        result_group_all = group_with_all_tasks._get_portal_total_hours_dict()
        self.assertEqual(result_group_all.get('allocated_hours'), 500.0, "Should only count the parent's allocated hours (500h).")
        self.assertEqual(result_group_all.get('effective_hours'), 90.0, "Should be the parent's total hours spent (90h).")

        # Test Case 2: A group containing only the parent task
        result_group_parent_only = parent_task._get_portal_total_hours_dict()
        self.assertEqual(result_group_parent_only.get('allocated_hours'), 500.0, "Should be the parent's allocated hours (500h).")
        self.assertEqual(result_group_parent_only.get('effective_hours'), 90.0, "Should be the parent's total hours spent (90h).")

        # Test Case 3: A group containing only the intermediate sub-task
        result_group_sub_only = sub_task_1._get_portal_total_hours_dict()
        self.assertEqual(result_group_sub_only.get('allocated_hours'), 50.0, "Should be the sub-task's allocated hours (50h).")
        self.assertEqual(result_group_sub_only.get('effective_hours'), 40.0, "Should be the sub-task's total hours spent (40h).")

        # Test Case 4: A group with a parent and a distant sub-task
        group_with_ancestor = parent_task | sub_task_2
        result_group_ancestor = group_with_ancestor._get_portal_total_hours_dict()
        self.assertEqual(result_group_ancestor.get('allocated_hours'), 500.0, "Should only count the parent's allocated hours (500h).")
        self.assertEqual(result_group_ancestor.get('effective_hours'), 90.0, "Should be the parent's total hours spent (90h).")

    def test_collaborators_accessible_by_timesheet_user(self):
        """Test that a restricted user (with only HR Timesheet User access) can
        access project collaborators (fetched when fetching a project) without
        getting an AccessError.
        """
        user = mail_new_test_user(
            self.env,
            login="employee_user",
            groups="hr_timesheet.group_hr_timesheet_user",
        )

        def store_fields(res: Store.FieldList):
            res.from_method("_store_thread_fields", request_list=["followers"])

        store = Store()
        store.add(self.project_portal.with_user(user), store_fields, as_thread=True)
        self.assertEqual(
            store.as_dict()["mail.thread"][0]["collaborator_ids"],
            [self.partner_portal.id],
        )


@tagged('post_install', '-at_install')
class TestPortalTimesheetDownload(HttpCase, TestProjectSharingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user_portal.password = 'chell'
        cls.employee = cls.env['hr.employee'].create({
            'name': 'Project User Employee',
            'user_id': cls.user_projectuser.id,
        })
        today = fields.Date.today()
        AnalyticLine = cls.env['account.analytic.line']
        cls.timesheet_foo = AnalyticLine.create({
            'name': 'foo meeting',
            'project_id': cls.project_portal.id,
            'task_id': cls.task_portal.id,
            'employee_id': cls.employee.id,
            'date': today,
            'unit_amount': 1,
        })
        cls.timesheet_bar = AnalyticLine.create({
            'name': 'bar meeting',
            'project_id': cls.project_portal.id,
            'task_id': cls.task_portal.id,
            'employee_id': cls.employee.id,
            'date': today,
            'unit_amount': 2,
        })
        cls.timesheet_old = AnalyticLine.create({
            'name': 'foo old',
            'project_id': cls.project_portal.id,
            'task_id': cls.task_portal.id,
            'employee_id': cls.employee.id,
            'date': today - relativedelta(years=2),
            'unit_amount': 3,
        })
        # not visible to the portal user
        cls.timesheet_private = AnalyticLine.create({
            'name': 'foo private',
            'project_id': cls.project_no_collabo.id,
            'task_id': cls.task_no_collabo.id,
            'employee_id': cls.employee.id,
            'date': today,
            'unit_amount': 4,
        })

    def _download(self, **params):
        """ Call the download route and return the response and the ids of the
            timesheets given to the report.
        """
        ReportModel = self.registry['ir.actions.report']
        original_render = ReportModel._render_qweb_pdf
        rendered_ids = []

        def _render_qweb_pdf(report_self, report_ref, res_ids=None, data=None):
            if report_ref == 'hr_timesheet.timesheet_report':
                rendered_ids.extend(res_ids or [])
            return original_render(report_self, report_ref, res_ids=res_ids, data=data)

        with patch.object(ReportModel, '_render_qweb_pdf', _render_qweb_pdf):
            response = self.url_open('/my/timesheets/download', params=params)
        self.assertEqual(response.status_code, 200)
        return response, set(rendered_ids)

    def test_portal_timesheet_download_filtered(self):
        self.authenticate('chell', 'chell')
        response, ids = self._download()
        self.assertEqual(ids, {self.timesheet_foo.id, self.timesheet_bar.id, self.timesheet_old.id})
        self.assertIn('attachment', response.headers['Content-Disposition'])

        _response, ids = self._download(filterby='year', search_in='name', search='foo')
        self.assertEqual(ids, {self.timesheet_foo.id})

        _response, ids = self._download(filterby='not_a_filter', search_in='name', search='foo')
        self.assertEqual(ids, {self.timesheet_foo.id, self.timesheet_old.id}, "An unknown filter falls back on 'all'.")

    def test_portal_timesheet_download_parent_task(self):
        subtask = self.env['project.task'].create({
            'name': 'Portal Subtask',
            'project_id': self.project_portal.id,
            'parent_id': self.task_portal.id,
        })
        timesheet_subtask = self.env['account.analytic.line'].create({
            'name': 'subtask work',
            'project_id': self.project_portal.id,
            'task_id': subtask.id,
            'employee_id': self.employee.id,
            'unit_amount': 1,
        })
        self.authenticate('chell', 'chell')
        _response, ids = self._download(parent_task_id=self.task_portal.id)
        self.assertEqual(ids, {timesheet_subtask.id})

    def test_portal_timesheet_download_access(self):
        self.authenticate('chell', 'chell')
        _response, ids = self._download(search_in='name', search='private')
        self.assertFalse(ids, "Timesheets outside the portal domain must never be printed.")

    def test_portal_timesheet_download_multi_company(self):
        company_b = self.env['res.company'].create({'name': 'Company B'})
        project_b = self.env['project.project'].create({
            'name': 'Portal B',
            'privacy_visibility': 'portal',
            'partner_id': self.user_portal.partner_id.id,
            'company_id': company_b.id,
        })
        employee_b = self.env['hr.employee'].create({
            'name': 'Employee B',
            'company_id': company_b.id,
        })
        timesheet_b = self.env['account.analytic.line'].with_company(company_b).create({
            'name': 'company b work',
            'project_id': project_b.id,
            'employee_id': employee_b.id,
            'unit_amount': 1,
        })
        self.authenticate('chell', 'chell')
        _response, ids = self._download()
        self.assertEqual(ids, {self.timesheet_foo.id, self.timesheet_bar.id, self.timesheet_old.id, timesheet_b.id})

    def test_portal_timesheet_download_empty(self):
        self.authenticate('chell', 'chell')
        _response, ids = self._download(search_in='name', search='nothing matches')
        self.assertFalse(ids)

    def test_portal_timesheet_download_button(self):
        self.authenticate('chell', 'chell')
        response = self.url_open('/my/timesheets')
        self.assertIn('/my/timesheets/download', response.text)

        response = self.url_open('/my/timesheets', params={'search_in': 'name', 'search': 'nothing matches'})
        self.assertNotIn('/my/timesheets/download', response.text)
