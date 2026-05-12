from odoo import api, fields, models
import uuid


class ClientDevice(models.Model):
    _name = "printer.client.device"
    _description = "Printer Client Device"
    _rec_name = "display_name"

    name = fields.Char(required=True)
    display_name = fields.Char(
        compute="_compute_display_name",
        store=True,
    )

    proxy_id = fields.Char(string="Proxy ID", required=True, copy=False, index=True)

    ip_address = fields.Char(string="IP Address")
    port = fields.Char(string="Port")

    proxy_status = fields.Selection(
        [
            ("active", "Active"),
            ("inactive", "Inactive"),
        ],
        default="inactive",
        readonly=True,
        required=True,
    )

    device_uuid = fields.Char(
        string="Device UUID",
        default=lambda self: str(uuid.uuid4()),
        readonly=True,
        copy=False,
    )
    host_name = fields.Char(string="Host Name")
    os = fields.Char(string="Operating System")
    os_version = fields.Char(string="OS Version")
    proxy_version = fields.Char(string="Proxy Version")

    printer_list = fields.One2many("printer.printer", "client_device_id", string="Printers")

    @api.depends("name", "ip_address")
    def _compute_display_name(self):
        for record in self:
            if record.ip_address:
                record.display_name = f"{record.name} ({record.ip_address})"
            else:
                record.display_name = record.name

    @api.model
    def add_data(self, data):
        """
        Create or update printer client device using proxy_id.
        """
        proxy_id = data.get("proxy_id")
        printer_list = data.pop("printer_list", [])
        if not proxy_id:
            return False

        values = {
            "proxy_id": proxy_id,
            "ip_address": data.get("ip_address"),
            "proxy_status": "active",
            "port": data.get("port"),
            "host_name": data.get("host_name"),
            "os": data.get("os"),
            "os_version": data.get("os_version"),
            "proxy_version": data.get("proxy_version"),
        }

        device = self.search(
            [("proxy_id", "=", proxy_id)],
            limit=1,
        )

        if device:
            device.write(values)
        else:
            values["name"] = data.get("host_name") + " (" + proxy_id + ")"
            device = self.create(values)

        device.update_printer_list(printer_list)
        return device

    # FIXME: upon change ip address/port it should not delete and create new printers
    def update_printer_list(self, printer_data_list):
        """
        Update the list of printers linked to this client device.
        """
        self.ensure_one()
        existing_printers = {printer.ip_address: printer for printer in self.printer_list}
        incoming_printer_ids = set()

        for printer_data in printer_data_list:
            pId = printer_data.get("id")
            if not pId:
                continue

            ip = self.ip_address + ":" + self.port + "/p/" + printer_data.get("id")
            incoming_printer_ids.add(ip)

            values = {
                "name": printer_data.get("name"),
                "ip_address": ip,
                "type": printer_data.get("type"),
                "use_lna": True,
                "client_device_id": self.id,
            }

            printer = existing_printers.get(ip)
            if printer:
                printer.write(values)
            else:
                self.env["printer.printer"].create(values)

        for ip, printer in existing_printers.items():
            if ip not in incoming_printer_ids:
                printer.unlink()
