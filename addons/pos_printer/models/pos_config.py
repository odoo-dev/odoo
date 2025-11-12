from odoo import fields, models, api, _
import urllib3
import requests
import logging

_logger = logging.getLogger(__name__)


class PosConfig(models.Model):
    _inherit = 'pos.config'

    network_printer = fields.Boolean(
        string='Use USB Printer',
        help="If checked, the POS will use a network printer for printing receipts."
    )
    device_ip = fields.Char(
        string='Device IP',
        help="Local IP address of a receipt printer.",
        default="printer-server.local:8088"
    )
    vendor_id = fields.Char(string='Vendor Id', help="Vendor id of a receipt printer.")
    product_id = fields.Char(string='Product Id', help="Product id of a receipt printer.")

    def action_open_printer_wizard(self):
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'usb.printer.selection.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'device_ip': self.device_ip,
                'default_printer_selection': 'none',
                'active_id': self.id
            },
        }
