# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from odoo import models

CHANNEL_RE = re.compile(r'^im_livechat\.channel_(\d+)$')


class IrWebsocket(models.AbstractModel):
    _inherit = 'ir.websocket'

    def _build_bus_channel_list(self, channels):
        channels = super()._build_bus_channel_list(channels)
        requested = {}
        for channel in channels:
            if match := isinstance(channel, str) and CHANNEL_RE.match(channel):
                requested[int(match.group(1))] = channel
        if not requested:
            return channels
        channels = [channel for channel in channels if channel not in requested.values()]
        channels.extend(self.env["im_livechat.channel"].search([("id", "in", list(requested))]))
        return channels
