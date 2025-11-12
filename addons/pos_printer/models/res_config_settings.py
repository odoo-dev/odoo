from odoo import fields, models, api, _
import re
from odoo.exceptions import ValidationError
import urllib3
import requests
import logging

_logger = logging.getLogger(__name__)

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_network_printer = fields.Boolean(
        related="pos_config_id.network_printer",
        readonly=False,
        string='Use USB Printer',
        help="If checked, the POS will use a network printer for printing receipts.")
    pos_device_ip = fields.Char(compute='_compute_pos_nw_printer_ip', store=True, readonly=False)
    pos_vendor_id = fields.Char(related="pos_config_id.vendor_id", readonly=False)
    pos_product_id = fields.Char(related="pos_config_id.product_id", readonly=False)

    pos_printer_selection = fields.Many2one( 
        "usb.printer.device.line",
        string="Available Printers",
        help="Select a printer detected from the device IP."
    )

    def action_refresh(self):
        self.env['usb.printer.device.line'].search([]).unlink()
        printers = []

        raw_ip = self.pos_device_ip or self.pos_config_id.device_ip or ""
        if not raw_ip:
            return [('none', 'No Device IP Configured')]

        # Ensure port is included
        device_ip = f"{raw_ip}:8088" if ':' not in raw_ip else raw_ip

        try:
            url = f"https://{device_ip}/printer-list"
            _logger.info(f"Fetching printers from: {url}")
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            response = requests.get(url, timeout=5, verify=False)
            data = response.json()
            if data.get("status") == "success":
                printers = data.get("message", [])
        except Exception as e:
            _logger.warning("Printer list fetch failed: %s", e)
        
        val_list= []
        for printer in printers:
            val_list.append({
                'name': printer.get("product", "Unknown"),
                'vendor_id': printer.get("vendor_id", "0000"),
                'product_id': printer.get("product_id", "0000"),
            })
        self.env["usb.printer.device.line"].create(val_list)


    @api.onchange("pos_printer_selection")
    def set_vid_pid(self):
        for config in self:
            if config.pos_printer_selection:
                config.pos_vendor_id, config.pos_product_id = config.pos_printer_selection.vendor_id, config.pos_printer_selection.product_id, 

    @api.depends('pos_network_printer', 'pos_config_id')
    def _compute_pos_nw_printer_ip(self):
        for res_config in self:
            if not res_config.pos_network_printer:
                res_config.pos_vendor_id = ''
                res_config.pos_product_id = ''
            else:
                res_config.pos_vendor_id = res_config.pos_config_id.vendor_id
                res_config.pos_product_id = res_config.pos_config_id.product_id
                res_config.pos_device_ip = res_config.pos_config_id.device_ip

    @api.constrains('pos_device_ip', 'pos_vendor_id', 'pos_product_id', 'pos_network_printer')
    def _constrains_printer_details(self):
        hex_pattern = re.compile(r'^[0-9a-fA-F]{4}$')
        for record in self:
            if not record.pos_network_printer:
                continue

            if not record.pos_device_ip and not record.pos_vendor_id and not record.pos_product_id:
                raise ValidationError(_("You must provide Device IP, Vendor ID and Product ID."))

            if record.pos_vendor_id and not hex_pattern.match(record.pos_vendor_id):
                raise ValidationError(_("Vendor ID must be a 4-character hexadecimal string."))

            if record.pos_product_id and not hex_pattern.match(record.pos_product_id):
                raise ValidationError(_("Product ID must be a 4-character hexadecimal string."))
