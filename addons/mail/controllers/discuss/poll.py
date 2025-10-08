from werkzeug.exceptions import NotFound

from odoo.addons.mail.tools.discuss import add_guest_to_context, Store
from odoo.fields import Command
from odoo.http import Controller, route


class PollController(Controller):
    @route("/discuss/poll/create", type="jsonrpc", auth="user", methods=["POST"])
    def poll_create(self, options, channel_id, poll_duration, poll_question, allow_multiple_options=False):
        channel = (
            self.env["discuss.channel"].search_fetch([("id", "=", channel_id)])
            if self.env.user._is_internal()
            else None
        )
        if not channel:
            raise NotFound()
        message = channel.message_post(
            body="", message_type="discuss_poll", subtype_xmlid="mail.mt_comment"
        )
        # sudo - discuss.poll: internal user can create poll on an accessible channel.
        poll = self.env["discuss.poll"].sudo().create(
            {
                "allow_multiple_options": allow_multiple_options,
                "option_ids": [Command.create({"choice": option}) for option in options],
                "poll_duration": poll_duration,
                "poll_question": poll_question,
                "start_message_id": message.id,
            }
        )
        Store(bus_channel=poll.channel_id).add(poll).bus_send()

    @route("/discuss/poll/end", type="jsonrpc", auth="user", methods=["POST"])
    def poll_end(self, poll_id):
        # sudo - discuss.poll: creator of the poll can end it premately.
        poll_sudo = self.env["discuss.poll"].sudo().search_fetch(
            [
                ("id", "=", poll_id),
                ("create_uid", "=", self.env.user.id),
                ("end_message_id", "=", False),
            ]
        )
        if not poll_sudo:
            raise NotFound()
        poll_sudo._end_and_notify()

    @route("/discuss/poll/delete", type="jsonrpc", auth="user", methods=["POST"])
    def poll_delete(self, poll_id):
        # sudo - discuss.poll: creator of the poll can delete it.
        if (
            poll_sudo := self.env["discuss.poll"]
            .sudo()
            .search_fetch([("id", "=", poll_id), ("create_uid", "=", self.env.user.id)])
        ):
            poll_sudo.unlink()

    @route("/discuss/poll/vote", type="jsonrpc", auth="public", methods=["POST"])
    @add_guest_to_context
    def poll_vote(self, poll_id, option_ids):
        options_sudo = self.env["discuss.poll.option"].sudo().search_fetch(
            [("poll_id", "=", poll_id), ("id", "in", option_ids)]
        )
        if not options_sudo.poll_id.channel_id.sudo(False).has_access("read"):
            raise NotFound()
        guest = self.env["mail.guest"]._get_guest_from_context()
        # sudo - discuss.poll.vote: user can create vote on poll of accessible channel.
        self.env["discuss.poll.vote"].sudo().create(
            [
                {
                    "option_id": option.id,
                    "guest_id": guest.id if self.env.user._is_public() else None,
                    "user_id": self.env.user.id if not self.env.user._is_public() else None,
                }
                for option in options_sudo
            ]
        )
        self_bus_channel = guest if self.env.user._is_public() else self.env.user
        Store(bus_channel=self_bus_channel).add(options_sudo, ["selected_by_self"]).bus_send()
        Store(bus_channel=options_sudo.poll_id.channel_id).add(
            options_sudo.poll_id.option_ids, ["number_of_votes", "vote_percentage"]
        ).bus_send()

    @route("/discuss/poll/remove_vote", type="jsonrpc", auth="public", methods=["POST"])
    @add_guest_to_context
    def poll_remove_vote(self, poll_id):
        # sudo - discuss.poll.vote: removing/accessing self vote is allowed.
        votes_sudo = self.env["discuss.poll.vote"].sudo().search_fetch(
            [("option_id.poll_id", "=", poll_id), ("is_self_vote", "=", True)]
        )
        if not votes_sudo:
            raise NotFound()
        options_sudo = votes_sudo.option_id
        poll_sudo = votes_sudo.option_id.poll_id
        votes_sudo.unlink()
        guest = self.env["mail.guest"]._get_guest_from_context()
        Store(bus_channel=guest if self.env.user._is_public() else self.env.user).add(
            options_sudo, ["selected_by_self"]
        ).bus_send()
        Store(bus_channel=options_sudo.poll_id.channel_id).add(
            poll_sudo.option_ids, ["number_of_votes", "vote_percentage"]
        ).bus_send()
