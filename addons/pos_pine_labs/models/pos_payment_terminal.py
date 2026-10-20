from odoo import fields, models


class PosPaymentTerminal(models.Model):
    _inherit = 'pos.payment.terminal'

    pine_labs_store = fields.Char(string='Pine Labs Store ID', help='The store id of the terminal, issued directly to the merchant by Pine Labs.', copy=False)
    pine_labs_client = fields.Char(string='Pine Labs Client ID', help='The client id of the terminal, issued directly to the merchant by Pine Labs.', copy=False)
