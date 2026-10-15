# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.mail.tests.common import MailCommon
from odoo.tests.common import HttpCase, tagged


@tagged("post_install", "-at_install")
class TestRatingFieldAccess(HttpCase, MailCommon):
    def test_rating_avg_not_leaked_to_public(self):
        """`rating_avg` is restricted to internal users (``groups='base.group_user'``).

        A public user must never receive it, even when the same ``/mail/store`` call batches a
        token (sudo) fetch. The fetched messages are collected in a param object and formatted
        in the requesting user's env, so a sudo (token) fetch can no longer make the whole batch
        be formatted in a sudo env and leak ``rating_avg``.
        """
        # public course: a public user reads it non-sudo -> rating_avg must be withheld
        public_course = self.env["slide.channel"].create(
            {
                "name": "Public course",
                "visibility": "public",
                "is_published": True,
            }
        )
        public_course.message_post(
            body="Nice", message_type="comment", rating_value=5, subtype_xmlid="mail.mt_comment"
        )
        # link course: not readable by a public user, reached only via its access token
        # -> sudo fetch; carrying a message, it would otherwise poison the batch env
        link_course = self.env["slide.channel"].create(
            {
                "name": "Link course",
                "visibility": "link",
            }
        )
        link_course.message_post(
            body="Hidden", message_type="comment", rating_value=3, subtype_xmlid="mail.mt_comment"
        )
        self.authenticate(None, None)  # public user
        res = self.make_jsonrpc_request(
            "/mail/store",
            {
                "fetch_params": [
                    [
                        "/mail/thread/messages",
                        {"thread_model": "slide.channel", "thread_id": public_course.id},
                    ],
                    [
                        "/mail/thread/messages",
                        {
                            "thread_model": "slide.channel",
                            "thread_id": link_course.id,
                            "access_params": {"token": link_course.access_token},
                        },
                    ],
                ],
            },
        )
        pub = next(
            (
                thread
                for thread in res.get("mail.thread", [])
                if thread["model"] == "slide.channel" and thread["id"] == public_course.id
            ),
            {},
        )
        # the public rating_count is sent (so the records entry is really there, not a false pass)
        self.assertIn("rating_count", pub, "public rating_count should be sent")
        # the internal-only rating_avg must never reach a public user
        self.assertNotIn("rating_avg", pub, "internal-only rating_avg must not leak to public")
