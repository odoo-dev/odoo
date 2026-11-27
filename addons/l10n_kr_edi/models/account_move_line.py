# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    l10n_kr_edi_supply_date = fields.Date(string="Supply Date", copy=False)
