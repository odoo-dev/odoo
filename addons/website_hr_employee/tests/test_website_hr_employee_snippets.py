from odoo.tests import HttpCase, tagged


@tagged('post_install', '-at_install')
class TestWebsiteHrEmployeeSnippets(HttpCase):

    def test_01_snippet_employee_details(self):
        test_dept1 = self.env['hr.department'].create({
            'name': 'management'
        })
        test_dept2 = self.env['hr.department'].create({
            'name': 'hr'
        })
        self.env['hr.employee'].create({
            'name': 'Employee Manager',
            'department_id': test_dept1.id,
            'work_email': 'mark.brown23@example.com',
            'job_title': 'Manager',
            'image_1920': False
        })
        self.env['hr.employee'].create({
            'name': 'Employee HR',
            'department_id': test_dept2.id,
            'work_email': 'tina.williamson98@example.com',
            'job_title': 'Human Resources Manager',
            'image_1920': False
        })
        self.start_tour('/', 'website_hr_employee.snippet_employee_details', login='admin')
