from odoo import fields, models


class PosPaymentTerminal(models.Model):
    _inherit = "pos.payment.terminal"

    mollie_terminal_id = fields.Char("Mollie Terminal ID", copy=False)
    mollie_payment_provider_id = fields.Many2one("payment.provider", domain=[("code", "=", "mollie")])
