from odoo import fields, models


class AccountMove(models.Model):
    _inherit = 'account.move'

    first_invoice = fields.Char('First Invoice')
    last_invoice = fields.Char('Last Invoice')