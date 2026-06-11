# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.http import request
from odoo.addons.mail.controllers.thread import ThreadController
from odoo.addons.mail.tools.discuss import mail_route, Store


class LinkPreviewController(ThreadController):
    @mail_route("/mail/link_preview", methods=["POST"], type="jsonrpc", auth="public")
    def mail_link_preview(self, message_id, access_params=None):
        if not request.env["mail.link.preview"]._is_link_preview_enabled():
            return
        message = self._get_message_with_access(
            int(message_id),
            mode="read",
            **(access_params or {}),
        )
        if not message:
            return
        if message.model and message.res_id:
            thread = message.env[message.model].search([("id", "=", message.res_id)])
            self._prepare_share_context(thread, access_params)
        if (
            not message.with_context(**request.env.context).is_current_user_or_guest_author
            and not request.env.user._is_admin()
        ):
            return
        store = Store()
        # sudo: mail.link.preview - only accessible to message author and admin (checked above)
        request.env["mail.link.preview"].sudo()._create_from_message_and_notify(
            message,
            request_url=request.httprequest.url_root,
            store=store,
        )
        return store

    @mail_route("/mail/link_preview/hide", methods=["POST"], type="jsonrpc", auth="public")
    def mail_link_preview_hide(self, message_link_preview_ids, access_params=None):
        # sudo: access check is done below using message_id
        link_preview_sudo = (
            request.env["mail.message.link.preview"]
            .sudo()
            .search([("id", "in", message_link_preview_ids)])
        )
        if not link_preview_sudo:
            return
        if not request.env.user._is_admin():
            for msg in link_preview_sudo.message_id:
                if not self._get_message_with_access(msg.id, mode="read", **(access_params or {})):
                    return
                if msg.model and msg.res_id:
                    thread = msg.env[msg.model].search([("id", "=", msg.res_id)])
                    self._prepare_share_context(thread, access_params)
                if not msg.with_context(**request.env.context).is_current_user_or_guest_author:
                    return
        store = Store()
        link_preview_sudo._hide_and_notify(store=store)
        return store
