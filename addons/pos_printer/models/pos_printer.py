from odoo import fields, models, api, _
from odoo.exceptions import ValidationError
import re


class PosPrinter(models.Model):
    _inherit = 'pos.printer'

    printer_type = fields.Selection(selection_add=[('esc_pos_printer', 'Use a POS Printer')])
    device_ip = fields.Char(string='Device IP Address', help="Public IP address of a device printer.", default="0.0.0.0")
    vendor_id = fields.Char(string='Vendor Id', help="Vendor id of a receipt printer.")
    product_id = fields.Char(string='Product Id', help="Product id of a receipt printer.")

    @api.constrains('device_ip', 'vendor_id', 'product_id', 'printer_type')
    def _constrains_printer_details(self):
        hex_pattern = re.compile(r'^[0-9a-fA-F]{4}$')
        for record in self:
            if record.printer_type != 'esc_pos_printer':
                continue

            if not record.device_ip and not record.vendor_id and not record.product_id:
                raise ValidationError(_("You must provide Device IP, Vendor ID and Product ID."))

            if record.vendor_id and not hex_pattern.match(record.vendor_id):
                raise ValidationError(_("Vendor ID must be a 4-character hexadecimal string."))

            if record.product_id and not hex_pattern.match(record.product_id):
                raise ValidationError(_("Product ID must be a 4-character hexadecimal string."))

    @api.model
    def _load_pos_data_fields(self, config):
        params = super()._load_pos_data_fields(config)
        params += ['device_ip', 'vendor_id', 'product_id']
        return params
