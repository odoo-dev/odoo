# Part of Odoo. See LICENSE file for full copyright and licensing details.

from markupsafe import Markup
from werkzeug.exceptions import NotFound

from odoo.http import Controller, request, route
from odoo.addons.mail.models.discuss.mail_guest import add_guest_to_context


class PollController(Controller):
    @route("/poll/create", type="json", auth="user", methods=["POST"])
    def poll_create(self, channel_id, question, answers):
        if not (channel := request.env["discuss.channel"].browse(channel_id).exists()):
            raise NotFound()
        notification = (
            Markup("<div class='o_mail_notification'>%s</div>") % f"created a poll: {question}"
        )
        message = channel.message_post(
            body=notification,
            message_type="notification",
            subtype_xmlid="mail.mt_comment",
        )
        poll = request.env["discuss.poll"].create({"message_id": message.id, "question": question})
        for answer in answers:
            request.env["discuss.poll.answer"].create({"poll_id": poll.id, "text": answer})
        poll._bus_send_store(poll)

    @route("/poll/vote", type="json", auth="public", methods=["POST"])
    @add_guest_to_context
    def poll_vote(self, poll_id, answer_ids):
        print("=== voting for poll_id=", poll_id, ", answer_ids=", answer_ids)

