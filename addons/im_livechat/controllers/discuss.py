from odoo.http import request
from odoo.addons.mail.controllers.discuss.search import SearchController
from odoo.addons.mail.tools.discuss import mail_route


class ImLivechatSearchController(SearchController):
    @mail_route("/discuss/search", methods=["POST"], type="jsonrpc", auth="public")
    def search(self, term, limit=10, **kwargs):
        request.update_context(fetch_livechat_previews=True)
        store = super().search(term, limit=limit, **kwargs)
        partner = request.env.user.partner_id
        if partner:
            pinned = request.env["discuss.channel.member"].search([
                ("partner_id", "=", partner.id),
                ("is_pinned", "=", True),
                ("channel_id.channel_type", "=", "livechat"),
            ]).channel_id
            store.add(pinned, "_store_channel_fields")

        return store
