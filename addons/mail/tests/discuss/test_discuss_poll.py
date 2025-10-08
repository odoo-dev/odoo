# Part of Odoo. See LICENSE file for full copyright and licensing details.

from contextlib import ExitStack
from datetime import timedelta
from itertools import product
from pprint import pformat

from odoo import fields
from odoo.addons.mail.tests.common import freeze_all_time
from odoo.exceptions import AccessError, UserError
from odoo.tests.common import HttpCase, JsonRpcException, new_test_user, tagged


@tagged("post_install", "-at_install")
class TestDiscussPoll(HttpCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.admin = new_test_user(
            cls.env, "admin_user", groups="base.group_erp_manager,base.group_system"
        )
        cls.internal = new_test_user(cls.env, "internal", groups="base.group_user")
        cls.public = new_test_user(cls.env, "public_user", groups="base.group_public")
        cls.guest = cls.env["mail.guest"].create({"name": "Guest"})
        cls.portal = new_test_user(cls.env, "portal_user", groups="base.group_portal")

    def test_01_only_one_option_allowed_on_single_option_polls(self):
        self.authenticate(self.internal.login, self.internal.login)
        channel = self.env["discuss.channel"].create({"name": "General"})
        self.make_jsonrpc_request(
            "/discuss/poll/create",
            {
                "options": ["Burger", "Pizza", "Tacos"],
                "channel_id": channel.id,
                "poll_duration": 1,
                "poll_question": "What is your favorite food?",
            },
        )
        poll = self.env["discuss.poll"].search([("start_message_id.res_id", "=", channel.id)])
        with (
            self.assertRaises(JsonRpcException) as error_catcher,
            self.assertLogs("odoo.http", level="WARNING") as log_catcher,
        ):
            self.make_jsonrpc_request(
                "/discuss/poll/vote", {"poll_id": poll.id, "option_ids": poll.option_ids.ids}
            )
        self.assertEqual(error_catcher.exception.args[0], "odoo.exceptions.ValidationError")
        self.assertIn(
            'WARNING:odoo.http:Cannot vote on poll "What is your favorite food?": only one vote is allowed per user.',
            log_catcher.output,
        )
        self.make_jsonrpc_request(
            "/discuss/poll/vote", {"poll_id": poll.id, "option_ids": poll.option_ids[0].ids}
        )
        self.assertIn(self.internal, poll.option_ids[0].vote_ids.user_id)

    def test_02_multiple_options_allowed_on_multi_option_polls(self):
        self.authenticate(self.internal.login, self.internal.login)
        channel = self.env["discuss.channel"].create({"name": "General"})
        self.make_jsonrpc_request(
            "/discuss/poll/create",
            {
                "allow_multiple_options": True,
                "options": ["Burger", "Pizza", "Tacos"],
                "channel_id": channel.id,
                "poll_duration": 1,
                "poll_question": "What is your favorite food?",
            },
        )
        poll = self.env["discuss.poll"].search([("start_message_id.res_id", "=", channel.id)])
        self.make_jsonrpc_request(
            "/discuss/poll/vote", {"poll_id": poll.id, "option_ids": poll.option_ids.ids}
        )
        self.assertIn(self.internal, poll.option_ids[0].vote_ids.user_id)
        self.assertIn(self.internal, poll.option_ids[1].vote_ids.user_id)
        self.assertIn(self.internal, poll.option_ids[2].vote_ids.user_id)

    def test_03_end_poll_after_poll_duration(self):
        self.authenticate(self.internal.login, self.internal.login)
        channel = self.env["discuss.channel"].create({"name": "General"})
        with freeze_all_time(fields.Datetime.now() - timedelta(minutes=30)):
            self.make_jsonrpc_request(
                "/discuss/poll/create",
                {
                    "options": ["Red", "Green", "Blue"],
                    "channel_id": channel.id,
                    "poll_duration": 60,
                    "poll_question": "What is your favorite color?",
                },
            )
            self.make_jsonrpc_request(
                "/discuss/poll/create",
                {
                    "options": ["Burger", "Pizza", "Tacos"],
                    "channel_id": channel.id,
                    "poll_duration": 10,
                    "poll_question": "What is your favorite food?",
                },
            )
        ongoing_poll = self.env["discuss.poll"].search(
            [
                ("poll_question", "=", "What is your favorite color?"),
                ("start_message_id.res_id", "=", channel.id),
            ]
        )
        expired_poll = self.env["discuss.poll"].search(
            [
                ("poll_question", "=", "What is your favorite food?"),
                ("start_message_id.res_id", "=", channel.id),
            ]
        )
        self.assertFalse(ongoing_poll.end_message_id)
        self.assertFalse(expired_poll.end_message_id)
        self.env["discuss.poll"]._end_expired_polls()
        self.assertFalse(ongoing_poll.end_message_id)
        self.assertTrue(expired_poll.end_message_id)

    def test_04_winning_option(self):
        self.authenticate(self.internal.login, self.internal.login)
        channel = self.env["discuss.channel"].create({"name": "General"})
        with freeze_all_time(fields.Datetime.now() - timedelta(hours=2)):
            self.make_jsonrpc_request(
                "/discuss/poll/create",
                {
                    "options": ["Burger", "Pizza", "Tacos"],
                    "channel_id": channel.id,
                    "poll_duration": 1,
                    "poll_question": "What is your favorite food?",
                },
            )
        poll = self.env["discuss.poll"].search([("start_message_id.res_id", "=", channel.id)])
        self.make_jsonrpc_request(
            "/discuss/poll/vote", {"poll_id": poll.id, "option_ids": poll.option_ids[0].ids}
        )
        self.env["discuss.poll"]._end_expired_polls()
        self.assertEqual(poll.winning_option_id, poll.option_ids[0])

    def test_05_no_winning_option_when_tied(self):
        self.authenticate(self.internal.login, self.internal.login)
        channel = self.env["discuss.channel"].create({"name": "General"})
        with freeze_all_time(fields.Datetime.now() - timedelta(hours=2)):
            self.make_jsonrpc_request(
                "/discuss/poll/create",
                {
                    "allow_multiple_options": True,
                    "options": ["Burger", "Pizza", "Tacos"],
                    "channel_id": channel.id,
                    "poll_duration": 1,
                    "poll_question": "What is your favorite food?",
                },
            )
        poll = self.env["discuss.poll"].search([("start_message_id.res_id", "=", channel.id)])
        self.make_jsonrpc_request(
            "/discuss/poll/vote", {"poll_id": poll.id, "option_ids": poll.option_ids[:2].ids}
        )
        self.env["discuss.poll"]._end_expired_polls()
        self.assertFalse(poll.winning_option_id)

    def test_06_vote_percentage_computation(self):
        self.authenticate(self.internal.login, self.internal.login)
        channel = self.env["discuss.channel"].create({"name": "General"})
        self.make_jsonrpc_request(
            "/discuss/poll/create",
            {
                "allow_multiple_options": True,
                "options": ["Burger", "Pizza", "Tacos"],
                "channel_id": channel.id,
                "poll_duration": 1,
                "poll_question": "What is your favorite food?",
            },
        )
        poll = self.env["discuss.poll"].search([("start_message_id.res_id", "=", channel.id)])
        cases = [
            [{"option": poll.option_ids[0], "votes": 1, "expected_percentage": 100}],
            [
                {"option": poll.option_ids[0], "votes": 1, "expected_percentage": 50},
                {"option": poll.option_ids[1], "votes": 1, "expected_percentage": 50},
            ],
            # Remainder skipped not to skew the results.
            [
                {"option": poll.option_ids[0], "votes": 1, "expected_percentage": 33},
                {"option": poll.option_ids[1], "votes": 1, "expected_percentage": 33},
                {"option": poll.option_ids[2], "votes": 1, "expected_percentage": 33},
            ],
            [
                {"option": poll.option_ids[0], "votes": 0, "expected_percentage": 0},
                {"option": poll.option_ids[1], "votes": 0, "expected_percentage": 0},
                {"option": poll.option_ids[2], "votes": 0, "expected_percentage": 0},
            ],
            [
                {"option": poll.option_ids[0], "votes": 2, "expected_percentage": 67},
                {"option": poll.option_ids[1], "votes": 1, "expected_percentage": 33},
            ],
            [
                {"option": poll.option_ids[0], "votes": 3, "expected_percentage": 50},
                {"option": poll.option_ids[1], "votes": 2, "expected_percentage": 33},
                {"option": poll.option_ids[2], "votes": 1, "expected_percentage": 17},
            ],
        ]
        max_votes = max(sum(a["votes"] for a in case) for case in cases)
        users = self.env["res.users"].browse(
            [
                new_test_user(self.env, f"user{i}", groups="base.group_user").id
                for i in range(1, max_votes + 1)
            ]
        )
        for case in cases:
            with self.subTest(pformat(case)):
                poll.option_ids.vote_ids.unlink()
                self.env["discuss.poll.vote"].create(
                    [
                        {"option_id": option_data["option"].id, "user_id": user.id}
                        for option_data in case
                        for user in users[: option_data["votes"]]
                    ]
                )
                for option_data in case:
                    self.assertEqual(
                        option_data["option"].vote_percentage, option_data["expected_percentage"]
                    )

    def _prepare_poll(self, user, membership, channel_type, owner, group=None):
        """Prepare a poll for a test case, including its channel, group assignment and
        membership.

        :param user: The user whose permissions are being tested.
        :param group: The group type for the channel ("group_matching", "group_failing", or "no_group").
        :param membership: Whether the test user is a member of the channel ("member") or outside it ("outside").
        :param channel_type: The type of channel ("channel" or "group").
        :return: The created `discuss.poll` record, ready for permission testing.
        """
        actual_group = self.env["res.groups"]
        if group == "group_matching":
            if user._is_internal():
                actual_group = self.env.ref("base.group_user")
            elif user._is_portal():
                actual_group = self.env.ref("base.group_portal")
        elif group == "group_failing":
            actual_group = self.env.ref("base.group_system")
        channel = self.env["discuss.channel"].create(
            {
                "name": f"{user.name}_{group}_{membership}_{channel_type}",
                "channel_type": channel_type,
                "group_public_id": actual_group.id,
            }
        )
        guest = self.guest if user._is_public() else self.env["mail.guest"]
        if membership == "member":
            channel._add_members(
                users=self.env["res.users"] if user._is_public() else user, guests=guest
            )
        self.authenticate(owner.login, owner.login)
        self.make_jsonrpc_request(
            "/discuss/poll/create",
            {
                "channel_id": channel.id,
                "options": ["Option 1", "Option 2"],
                "poll_duration": 1,
                "poll_question": "???",
            },
        )
        self.authenticate(None, None)
        return (
            self.env["discuss.poll"]
            .search([("start_message_id.res_id", "=", channel.id)])
            .with_user(user)
            .with_context(guest=guest)
        )

    def test_07_poll_controller_access(self):
        cases = [
            *product(
                self.public | self.portal,
                ["channel"],
                ["no_group", "group_matching", "group_failing"],
                ["member", "outside"],
                ["create", "read", "unlink", "write"],
                [False],
            ),
            *product(
                self.public | self.portal,
                ["group"],
                [None],
                ["member", "outside"],
                ["create", "read", "unlink", "write"],
                [False],
            ),
            *product(
                self.internal,
                ["channel"],
                ["no_group", "group_matching"],
                ["member", "outside"],
                ["create"],
                [True],
            ),
            *product(
                self.internal,
                ["channel"],
                ["group_failing"],
                ["member", "outside"],
                ["create"],
                [False],
            ),
            *product(
                self.internal,
                ["channel"],
                ["no_group", "group_matching", "group_failing"],
                ["member", "outside"],
                ["read", "unlink", "write"],
                [False],
            ),
            (self.internal, "group", None, "member", "create", True),
            (self.internal, "group", None, "outside", "create", False),
            *product(
                self.internal,
                ["group"],
                [None],
                ["member", "outside"],
                ["read", "unlink", "write"],
                [False],
            ),
        ]
        for user, channel_type, group, membership, operation, allowed in cases:
            test_name = (
                f'Check "{operation}" access for {user.name}. channel_type={channel_type}, group={group}, '
                f"membership={membership}, allowed={allowed}."
            )
            with self.subTest(test_name):
                poll_owner = user if operation == "create" else self.admin
                with ExitStack() as stack:
                    if operation == "create" and not allowed:
                        stack.enter_context(self.assertRaises(JsonRpcException))
                    poll = self._prepare_poll(
                        user, membership, channel_type, poll_owner, group=group
                    )
                if operation == "create":
                    continue
                with ExitStack() as stack:
                    if not allowed:
                        stack.enter_context(self.assertRaises(AccessError))
                    poll.check_access(operation)

    def test_08_poll_vote_access(self):
        cases = [
            *product(
                self.internal | self.public | self.portal,
                ["channel"],
                ["no_group", "group_matching"],
                ["member", "outside"],
                ["create"],
                [True],
            ),
            *product(
                self.internal | self.public | self.portal,
                ["channel"],
                ["group_failing"],
                ["member", "outside"],
                ["create"],
                [False],
            ),
            *product(
                self.internal | self.public | self.portal,
                ["group"],
                [None],
                ["member"],
                ["create"],
                [True],
            ),
            *product(
                self.internal | self.public | self.portal,
                ["group"],
                [None],
                ["outside"],
                ["create"],
                [False],
            ),
        ]
        for user, channel_type, group, membership, operation, allowed in cases:
            test_name = (
                f'Check "{operation}" access for {user.name}. channel_type={channel_type}, group={group}, '
                f"membership={membership}, allowed={allowed}."
            )
            with self.subTest(test_name):
                operation_parts = operation.split("_")
                actual_operation = operation_parts[0]
                poll_sudo = self._prepare_poll(
                    user, membership, channel_type, self.admin, group=group
                ).sudo()
                with ExitStack() as stack:
                    if actual_operation == "create" and not allowed:
                        stack.enter_context(self.assertRaises(JsonRpcException))
                        stack.enter_context(self.assertLogs("odoo.http", level="WARNING"))
                    self.authenticate(user.login, user.login)
                    cookies = {}
                    if user._is_public():
                        cookies[self.guest._cookie_name] = self.guest._format_auth_cookie()
                    self.make_jsonrpc_request(
                        "/discuss/poll/vote",
                        {"poll_id": poll_sudo.id, "option_ids": poll_sudo.option_ids[0].id},
                        cookies=cookies,
                    )
                    vote = (
                        self.env["discuss.poll.vote"]
                        .sudo()
                        .search([("option_id", "=", poll_sudo.option_ids[0].id)])
                        .sudo(False)
                    )
                if actual_operation == "create":
                    continue
                with ExitStack() as stack:
                    if not allowed:
                        stack.enter_context(self.assertRaises(AccessError))
                    vote.with_user(user).with_context(
                        guest=self.guest if user._is_public() else None
                    ).check_access(actual_operation)

    def test_09_cannot_vote_on_closed_polls(self):
        self.authenticate(self.internal.login, self.internal.login)
        channel = self.env["discuss.channel"].create({"name": "General"})
        with freeze_all_time(fields.Datetime.now() - timedelta(hours=2)):
            self.make_jsonrpc_request(
                "/discuss/poll/create",
                {
                    "allow_multiple_options": True,
                    "options": ["Burger", "Pizza", "Tacos"],
                    "channel_id": channel.id,
                    "poll_duration": 1,
                    "poll_question": "What is your favorite food?",
                },
            )
        poll = self.env["discuss.poll"].search([("start_message_id.res_id", "=", channel.id)])
        self.make_jsonrpc_request(
            "/discuss/poll/vote", {"poll_id": poll.id, "option_ids": poll.option_ids[0].ids}
        )
        self.env["discuss.poll"]._end_expired_polls()
        self.assertTrue(poll.end_message_id)
        with (
            self.assertRaises(JsonRpcException) as error_catcher,
            self.assertLogs("odoo.http", level="WARNING") as log_catcher,
        ):
            self.make_jsonrpc_request(
                "/discuss/poll/vote", {"poll_id": poll.id, "option_ids": poll.option_ids[1].ids}
            )
        self.assertEqual(error_catcher.exception.args[0], "odoo.exceptions.ValidationError")
        self.assertIn(
            'WARNING:odoo.http:Cannot vote on closed poll: "What is your favorite food?"',
            log_catcher.output,
        )

    def test_10_cannot_change_option_poll(self):
        self.authenticate(self.internal.login, self.internal.login)
        general = self.env["discuss.channel"].create({"name": "General"})
        sales = self.env["discuss.channel"].create({"name": "Sales"})
        self.make_jsonrpc_request(
            "/discuss/poll/create",
            {
                "options": ["Burger", "Pizza", "Tacos"],
                "channel_id": general.id,
                "poll_duration": 1,
                "poll_question": "What is your favorite food?",
            },
        )
        self.make_jsonrpc_request(
            "/discuss/poll/create",
            {
                "options": ["Red", "Green", "Blue"],
                "channel_id": sales.id,
                "poll_duration": 1,
                "poll_question": "What is your favorite color?",
            },
        )
        general_poll = self.env["discuss.poll"].search(
            [("start_message_id.res_id", "=", general.id)]
        )
        sales_poll = self.env["discuss.poll"].search([("start_message_id.res_id", "=", sales.id)])
        with self.assertRaises(UserError) as error_catcher:
            general_poll.option_ids.poll_id = sales_poll
        self.assertEqual(
            error_catcher.exception.args[0],
            "Cannot change the poll linked to the following options: Burger, Pizza, and Tacos.",
        )

    def test_11_poll_ui(self):
        channel = self.env["discuss.channel"].create({"name": "General"})
        self.start_tour(
            f"/odoo/discuss?active_id={channel.id}",
            "discuss_poll_tour.js",
            login=self.internal.login,
            debug=True,
        )
