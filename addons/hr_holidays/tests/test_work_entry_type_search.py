from odoo.tests import tagged

from odoo.addons.hr_holidays.tests.common import TestHrHolidaysCommon


@tagged("work_entry_search")
class TestWorkEntryTypeSearch(TestHrHolidaysCommon):
    def test_work_entry_type_search(self):
        employee_test = self.env["hr.employee"].create({"name": "Test Employee"})

        work_entry_type_test = self.env["hr.work.entry.type"].create(
            {
                "name": "Paid Time Off",
                "code": "Paid Time Off",
                "requires_allocation": True,
                "allocation_validation_type": "no_validation",
                "request_unit": "day",
                "unit_of_measure": "day",
            }
        )

        self.env["hr.leave.allocation"].create(
            {
                "employee_id": employee_test.id,
                "work_entry_type_id": work_entry_type_test.id,
                "number_of_days": 1,
            }
        )

        work_entry_type_search_test = (
            self.env["hr.work.entry.type"]
            .with_context(employee_id=employee_test.id)
            .search([("virtual_remaining_leaves", ">", 0)])
        )

        self.assertIn(
            work_entry_type_test,
            work_entry_type_search_test,
            "Should have found the work entry type that was created.",
        )
