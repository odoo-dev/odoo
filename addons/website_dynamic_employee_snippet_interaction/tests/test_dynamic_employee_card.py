from odoo.tests import HttpCase, tagged


@tagged("post_install", "-at_install")
class TestDynamicEmployeeCard(HttpCase):

    @classmethod
    def setUpClass(self):
        super().setUpClass()
        dept1 = self.env["hr.department"].create({"name": "Marketing"})
        dept2 = self.env["hr.department"].create({"name": "Resources Manager"})
        dept3 = self.env["hr.department"].create({"name": "Research and Development"})
        self.env["hr.employee"].create(
            [
                {
                    "name": "john Cena",
                    "department_id": dept1.id,
                    "work_email": "johncena@example.com",
                    "work_phone": "123456789",
                    "job_title": "Manager",
                    "image_1920": False,
                },
                {
                    "name": "Seth Rollins",
                    "department_id": dept1.id,
                    "work_email": "sethrollins@example.com",
                    "work_phone": "123456789",
                    "job_title": "Social Media",
                    "image_1920": False,
                },
                {
                    "name": "Brock Lessnor",
                    "department_id": dept1.id,
                    "work_email": "brcles@example.com",
                    "work_phone": "123456789",
                    "job_title": "Employee",
                    "image_1920": False,
                },
                {
                    "name": "undertaker",
                    "department_id": dept2.id,
                    "work_email": "undertaker@example.com",
                    "work_phone": "123456789",
                    "job_title": "Human Resources Manager",
                    "image_1920": False,
                },
                {
                    "name": "kane",
                    "department_id": dept2.id,
                    "work_email": "kane@example.com",
                    "work_phone": "123456789",
                    "job_title": "Human Resources agent",
                    "image_1920": False,
                },
                {
                    "name": "braddy",
                    "department_id": dept2.id,
                    "work_email": "braddy@example.com",
                    "work_phone": "123456789",
                    "job_title": "Human Resources recruiter",
                    "image_1920": False,
                },
                {
                    "name": "salman khan",
                    "department_id": dept3.id,
                    "work_phone": "123456789",
                    "work_email": "sallmankhan@example.com",
                    "job_title": "lead developer",
                    "image_1920": False,
                },
                {
                    "name": "akshay kumar",
                    "department_id": dept3.id,
                    "work_phone": "123456789",
                    "work_email": "akkumar@example.com",
                    "job_title": "intern",
                    "image_1920": False,
                },
                {
                    "name": "amitabh bachan",
                    "department_id": dept2.id,
                    "work_phone": "123456789",
                    "work_email": "abb@example.com",
                    "job_title": "sr developer",
                    "image_1920": False,
                },
            ]
        )

    def test_dynamic_employee_card(self):
        self.start_tour("/", "dynamic_employee_card", login="admin", watch=True)
