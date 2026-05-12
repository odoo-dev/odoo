from odoo import http
from odoo.http import request


class DeviceController(http.Controller):

    @http.route(
        "/printer/client_device/register",
        type="jsonrpc",
        auth="user",
    )
    def register_client_device(self, device_uuid, display_name=None):
        return request.env[
            "printer.client.device"
        ].sudo().enrich_from_request(
            device_uuid=device_uuid,
            display_name=display_name,
        ).id
