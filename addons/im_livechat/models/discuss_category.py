# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class DiscussCategory(models.Model):
    _inherit = "discuss.category"

    def _category_technical_key_to_lazy_fetch_params(self):
        params = super()._category_technical_key_to_lazy_fetch_params()
        is_pinned = [("channel_member_ids", "any", [("is_self", "=", True), ("is_pinned", "=", True)])]
        params["im_livechat.livechat"] = {
            "domain": [("channel_type", "=", "livechat")] + is_pinned,
            "order": "name asc, id desc",
        }
        params["im_livechat.need_help"] = {
            "domain": [
                ("channel_type", "=", "livechat"),
                ("livechat_status", "=", "need_help"),
            ],
            "order": "livechat_looking_for_help_since_dt asc, id asc",
        }
        return params
