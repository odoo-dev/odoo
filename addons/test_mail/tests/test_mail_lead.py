from datetime import datetime, timezone, timedelta
from odoo.addons.mail.tests.common import MailCommon
from odoo.tests import tagged


class TestLeadCommon(MailCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Create crm-lead like test records
        leads = cls.env["mail.test.lead"].create([
            {"name": f"CRM Lead {i}"} for i in range(1, 7)
        ])
        (
            cls.test_lead_1,
            cls.test_lead_2,
            cls.test_lead_3,
            cls.test_lead_4,
            cls.test_lead_5,
            cls.test_lead_6,
        ) = leads


@tagged("post_install", "-at_install")
class TestCrmLeadActivityState(TestLeadCommon):
    def test_groupby_activity_state_progress_bar_behavior(self):
        """Test activity_state groupby logic on mail.test.lead"""

        def create_activity(res_id, timedelta=timedelta(days=0)):
            return self.env["mail.activity"].create(
            {
                "summary": f"Test activity for CRM lead {res_id.id}",
                "res_model_id": self.env["ir.model"]._get_id("mail.test.lead"),
                "res_id": res_id,
                "date_deadline": datetime.now(timezone.utc) + timedelta,
                "user_id": self.env.user.id,
            }
            )

        activity_1 = create_activity(self.test_lead_1)
        activity_2 = create_activity(self.test_lead_2, timedelta=timedelta(days=-2))
        activity_3 = create_activity(self.test_lead_3, timedelta=timedelta(days=-2))
        activity_4 = create_activity(self.test_lead_4)
        activity_5 = create_activity(self.test_lead_5, timedelta=timedelta(days=2))
        activity_6 = create_activity(self.test_lead_6, timedelta=timedelta(days=-2))

        self.assertEqual(activity_1.state, "today")
        self.assertEqual(activity_2.state, "overdue")
        self.assertEqual(activity_3.state, "overdue")
        self.assertEqual(activity_4.state, "today")
        self.assertEqual(activity_5.state, "planned")
        self.assertEqual(activity_6.state, "overdue")

        # grouping by 'activity_state' and 'activity_state' as the progress bar
        domain = [("name", "!=", "")]
        groupby = "activity_state"
        progress_bar = {
            "field": "activity_state",
            "colors": {
                "overdue": "danger",
                "today": "warning",
                "planned": "success",
            },
        }
        progressbars = self.test_lead_1.read_progress_bar(
            domain=domain, group_by=groupby, progress_bar=progress_bar
        )

        self.assertEqual(len(progressbars), 3)
        expected_progressbars = {
            "overdue": {"overdue": 3, "today": 0, "planned": 0},
            "today": {"overdue": 0, "today": 2, "planned": 0},
            "planned": {"overdue": 0, "today": 0, "planned": 1},
        }
        self.assertEqual(dict(progressbars), expected_progressbars)
