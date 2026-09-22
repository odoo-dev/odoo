# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models

THEME_SYNC_CHANNEL_PREFIX = "im_livechat.channel_"
THEME_SYNC_CHANNEL_SUFFIX = "/theme_sync"


class IrWebsocket(models.AbstractModel):
    _inherit = "ir.websocket"

    def _build_bus_channel_list(self, channels):
        new_channels = []
        for channel in channels:
            is_theme_sync_channel = (
                isinstance(channel, str)
                and channel.startswith(THEME_SYNC_CHANNEL_PREFIX)
                and channel.endswith(THEME_SYNC_CHANNEL_SUFFIX)
            )
            if not is_theme_sync_channel:
                new_channels.append(channel)
                continue
            channel_id = channel[len(THEME_SYNC_CHANNEL_PREFIX):-len(THEME_SYNC_CHANNEL_SUFFIX)]
            record = (
                self.env["im_livechat.channel"].browse(int(channel_id))
                if channel_id.isdigit()
                else self.env["im_livechat.channel"]
            )
            if record.exists() and record.has_access("read"):
                new_channels.append((record, "THEME_SYNC"))
        return super()._build_bus_channel_list(new_channels)
