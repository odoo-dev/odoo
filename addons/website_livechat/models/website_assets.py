# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models


class WebsiteAssets(models.AbstractModel):
    _inherit = "website.assets"

    @api.model
    def make_scss_customization(self, url, values):
        if not {"o-color-1", "o-color-2", "color-palettes-name"} & values.keys():
            return super().make_scss_customization(url, values)
        if not self.env.website and (host_id := self.env.context.get("host_id")):
            self = self.with_context(website_id=host_id)
        channel = self.env.website.sudo().channel_id
        was_following_theme = channel.theme_colors_synced
        result = super().make_scss_customization(url, values)
        if was_following_theme:
            self._schedule_theme_colors_sync(channel)
        return result

    def _schedule_theme_colors_sync(self, channel):
        pending = self.env.cr.precommit.data.setdefault(
            "website_livechat.pending_theme_colors_sync", set(),
        )
        if not pending:
            self.env.cr.precommit.add(self._sync_theme_colors)
        pending.add(channel.id)

    def _sync_theme_colors(self):
        channel_ids = self.env.cr.precommit.data.pop(
            "website_livechat.pending_theme_colors_sync", set(),
        )
        for channel in self.env["im_livechat.channel"].sudo().browse(channel_ids).exists():
            channel.write(channel.get_website_theme_colors())
            channel._bus_send(
                "im_livechat.channel/theme_colors_synced",
                {"id": channel.id},
                subchannel="THEME_SYNC",
            )
