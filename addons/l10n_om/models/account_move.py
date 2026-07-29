from odoo import models
from odoo.tools import float_compare


class AccountMove(models.Model):
    _inherit = 'account.move'

    def _l10n_om_is_simplified(self):
        self.ensure_one()
        return float_compare(self.amount_untaxed, 500, precision_rounding=self.currency_id.rounding) < 0
