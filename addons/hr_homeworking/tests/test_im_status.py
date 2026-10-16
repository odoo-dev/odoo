# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import HttpCase, tagged

from odoo.addons.mail.tests.common import mail_new_test_user


@tagged("post_install", "-at_install")
class TestImStatusMultiCompany(HttpCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company_a = cls.env.company
        cls.company_b = cls.env["res.company"].create({"name": "Company B"})
        cls.user_employee = mail_new_test_user(
            cls.env,
            company_id=cls.company_a.id,
            company_ids=[cls.company_a.id, cls.company_b.id],
            login="user_employee",
        )
        cls.alice_user = cls._create_user_at_home("alice_user", cls.company_b, cls.company_b)
        cls.clara_user = cls._create_user_at_home("clara_user", cls.company_a, cls.company_a)
        cls.dana_user = cls._create_user_at_home(
            "dana_user",
            cls.company_a | cls.company_b,
            cls.company_b,
        )
        cls.group = (
            cls.env["discuss.channel"]
            .with_user(cls.user_employee)
            ._create_group((cls.alice_user | cls.clara_user | cls.dana_user).partner_id.ids)
        )

    @classmethod
    def _create_user_at_home(cls, login, companies, employee_company):
        user = mail_new_test_user(
            cls.env,
            company_id=companies[0].id,
            company_ids=companies.ids,
            login=login,
        )
        home = cls.env["hr.work.location"].create(
            {
                "address_id": employee_company.partner_id.id,
                "company_id": employee_company.id,
                "location_type": "home",
                "name": "Home",
            },
        )
        cls.env["hr.employee"].create(
            {
                "company_id": employee_company.id,
                "friday_location_id": home.id,
                "monday_location_id": home.id,
                "name": login,
                "saturday_location_id": home.id,
                "sunday_location_id": home.id,
                "thursday_location_id": home.id,
                "tuesday_location_id": home.id,
                "user_id": user.id,
                "wednesday_location_id": home.id,
            },
        )
        return user

    def test_im_status_same_on_every_route(self):
        self.authenticate(self.user_employee.login, self.user_employee.password)
        mail_data = self.make_jsonrpc_request(
            "/mail/data",
            {
                "context": {"allowed_company_ids": [self.company_b.id, self.company_a.id]},
                "fetch_params": ["channels_as_member"],
            },
        )
        channel_members = self.make_jsonrpc_request(
            "/discuss/channel/members",
            {"channel_id": self.group.id, "known_member_ids": []},
        )
        for route, result in [
            ("/mail/data", mail_data),
            ("/discuss/channel/members", channel_members),
        ]:
            im_status_by_partner = {p["id"]: p.get("im_status") for p in result["res.partner"]}
            for user in self.alice_user | self.clara_user | self.dana_user:
                with self.subTest(route=route, user=user.login):
                    self.assertEqual(im_status_by_partner[user.partner_id.id], "home_offline")
        for user in self.alice_user | self.clara_user | self.dana_user:
            with self.subTest(model="res.users", user=user.login):
                self.assertEqual(user.with_user(self.user_employee).im_status, "home_offline")
