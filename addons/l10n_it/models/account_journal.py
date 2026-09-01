# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class AccountJournal(models.Model):
    _inherit = "account.journal"

    l10n_it_cuc_code = fields.Char(
        string="CUC Code",
        size=8,
        help="8-character alphanumeric CUC code assigned by the Italian bank.",
    )
