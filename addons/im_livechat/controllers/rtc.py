# Part of Odoo. See LICENSE file for full copyright and licensing details.

from werkzeug.exceptions import Forbidden

from odoo.http import route
from odoo.addons.mail.controllers.discuss.rtc import RtcController
from odoo.addons.mail.tools.discuss import add_guest_to_context


class LivechatRtcController(RtcController):
    @route()
    @add_guest_to_context
    def channel_call_join(self, channel_id, check_rtc_session_ids=None, camera=False):
        channel = self.env["discuss.channel"].search([("id", "=", channel_id)])
        # sudo - discuss.channel.rtc.session: checking if there's an ongoing
        # call to prevent visitors from starting one is acceptable.
        if channel.self_member_id.livechat_member_type == "visitor" and not channel.sudo().rtc_session_ids:
            raise Forbidden()
        return super().channel_call_join(channel_id, check_rtc_session_ids, camera)
