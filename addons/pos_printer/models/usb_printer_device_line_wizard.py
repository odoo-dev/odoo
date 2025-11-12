import logging
import requests
import urllib3
from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class USBPrinterDeviceLine(models.TransientModel):
    _name = "usb.printer.device.line"
    _description = "USB Printer Device Line"

    name = fields.Char("Printer Name")
    vendor_id = fields.Char("Vendor ID")
    product_id = fields.Char("Product ID")

    wizard_id = fields.Many2one('usb.printer.selection.wizard', string="Wizard")
