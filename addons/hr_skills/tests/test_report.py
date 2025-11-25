# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests.common import HttpCase
from odoo.tests import tagged
from odoo.tools import mute_logger


@tagged("post_install", "-at_install")
class SkillsTestReport(HttpCase):
    @mute_logger("odoo.http")
    def test_report_traceback(self):
        partner = self.env["res.partner"].create({"name": "Partner Test"})
        company_A = self.env["res.company"].create({"name": "company_A"})
        employee = self.env["hr.employee"].create(
            {
                "name": "employee_A",
                "work_contact_id": partner.id,
                "company_id": company_A.id,
            }
        )
        wizard = self.env["hr.employee.cv.wizard"].create(
            {"employee_ids": [employee.id]}
        )
        template = """
        <t t-name="hr_skills.report_employee_cv">
            <t t-set="full_width" t-value="True"/>
            <t t-call="web.basic_layout">
            <div t-if ="o.no"/>
            <t t-foreach="docs" t-as="o">
                <div class="o_employee_cv page">
                    <t t-call="hr_skills.report_employee_cv_company"/>
                    <t t-call="hr_skills.report_employee_cv_sidepanel"/>
                    <t t-call="hr_skills.report_employee_cv_main_panel"/>
                    <p class="o_new_page"/>
                </div>
            </t>
            </t>
        </t>"""
        report_view = self.env.ref(
            "hr_skills.report_employee_cv", raise_if_not_found=False
        )
        self.assertTrue(report_view)
        report_view.arch = template
        view = wizard.action_validate()
        self.authenticate("admin", "admin")
        response = self.url_open(view["url"])
        self.assertRegex(response.content.decode(), "KeyError")
