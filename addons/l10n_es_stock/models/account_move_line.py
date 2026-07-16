from odoo import fields, models


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    purchase_price = fields.Float('Purchase Price')
