from odoo import models, fields, api, _
import urllib3
import requests
import logging

class UsbPrinterSelectionWizard(models.TransientModel):
    _name = 'usb.printer.selection.wizard'
    _description = 'USB Printer Selection Wizard'

    selected_printer_id = fields.Many2one(
        'usb.printer.device.line', string='Select Printer'
    )

    def action_refresh(self):
        self.env['usb.printer.device.line'].search([]).unlink()

        printers = []
        raw_ip = self.env.context.get('device_ip') or ""
        if not raw_ip:
            return

        device_ip = f"{raw_ip}:8088" if ':' not in raw_ip else raw_ip

        try:
            url = f"https://{device_ip}/printer-list"
            _logger = logging.getLogger(__name__)
            _logger.info(f"Fetching printers from: {url}")
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            response = requests.get(url, timeout=5, verify=False)
            data = response.json()
            if data.get("status") == "success":
                printers = data.get("message", [])
        except Exception as e:
            _logger.warning("Printer list fetch failed: %s", e)

        vals_list = []
        for printer in printers:
            vals_list.append({
                'name': printer.get("product", "Unknown"),
                'vendor_id': printer.get("vendor_id", "0000"),
                'product_id': printer.get("product_id", "0000"),
                'wizard_id': self.id,
            })
        self.env['usb.printer.device.line'].create(vals_list)

    def action_confirm(self):
        if self.selected_printer_id:
            pos_config = self.env['pos.config'].browse(self.env.context.get('active_id'))
            if pos_config:
                pos_config.vendor_id = self.selected_printer_id.vendor_id
                pos_config.product_id = self.selected_printer_id.product_id

        return {'type': 'ir.actions.act_window_close'}
