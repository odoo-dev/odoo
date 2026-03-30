# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import models
from odoo.addons.bus.websocket import wsrequest
from odoo.http import request

_logger = logging.getLogger(__name__)


class IrWebsocket(models.AbstractModel):
    _inherit = "ir.websocket"

    def _serve_ir_websocket(self, event_name, data):
        super()._serve_ir_websocket(event_name, data)
        if event_name == "self_device_update_presence":
            self._update_device_status("online")

    def _subscribe(self, og_data):
        super()._subscribe(og_data)

    def _on_websocket_closed(self, cookies):
        super()._on_websocket_closed(cookies)
        self._update_device_status("offline", cookies)

    def _update_device_status(self, status, cookies=None):
        if device := self._get_device(cookies):
            device_sudo = device.sudo()
            device_sudo.status = status
            device_sudo._notify_ui('status_update')

    def _get_device(self, cookies=None):
        device_model = self.env["pos.self.device"]
        if not cookies:
            req = request or wsrequest
            if not req:
                return None
            cookies = req.cookies

        token = cookies.get(device_model._cookie_name)
        if not token:
            return None
        return device_model._get_device_from_token(token)
