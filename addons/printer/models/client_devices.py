from odoo import api, fields, models
from odoo.http import request
import uuid


class ClientDevice(models.Model):
    _name = "printer.client.device"
    _description = "Printer Client Device"
    _rec_name = "display_name"

    name = fields.Char(required=True)
    device_uuid = fields.Char(
        string="Device UUID",
        required=True,
        index=True,
        copy=False,
        default=lambda self: str(uuid.uuid4()),
    )

    ip_address = fields.Char(string="IP Address")
    user_agent = fields.Text(string="User Agent")

    user_id = fields.Many2one(
        "res.users",
        string="Last User",
        ondelete="set null",
    )

    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
    )

    approved = fields.Boolean(default=False)
    active = fields.Boolean(default=True)

    last_seen = fields.Datetime()
    first_seen = fields.Datetime(default=fields.Datetime.now)

    # proxy_device_id = fields.Many2one(
    #     "printer.proxy.device",
    #     string="Assigned Proxy",
    #     ondelete="set null",
    # )

    notes = fields.Text()

    _sql_constraints = [
        (
            "device_uuid_unique",
            "unique(device_uuid)",
            "Device UUID must be unique.",
        ),
    ]

    @api.model
    def enrich_from_request(self, device_uuid=None, display_name=None):
        """
        Create/update device info from current HTTP request.
        Intended to be called from controllers.
        """
        httprequest = request.httprequest

        ip_address = (
            httprequest.headers.get("X-Forwarded-For")
            or httprequest.remote_addr
        )

        user_agent = httprequest.headers.get("User-Agent")

        values = {
            "ip_address": ip_address,
            "user_agent": user_agent,
            "last_seen": fields.Datetime.now(),
            "user_id": self.env.user.id,
        }

        if display_name:
            values["name"] = display_name

        if not device_uuid:
            device_uuid = str(uuid.uuid4())

        device = self.search(
            [("device_uuid", "=", device_uuid)],
            limit=1,
        )

        if device:
            device.write(values)
            return device

        values.update({
            "device_uuid": device_uuid,
            "name": display_name or ip_address or "Unknown Device",
        })

        return self.create(values)
