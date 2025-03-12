from odoo import models, _
from odoo.exceptions import UserError


class PoSSession(models.Model):
    _inherit = 'pos.session'

    def _validate_session(self, balancing_account=False, amount_to_balance=0, bank_payment_method_diffs=None):
        """
            Override
        """
        if any(o.l10n_eg_pos_eta_state == 'pending' for o in self.order_ids):
            raise UserError(_("Cannot close a session if any of the receipts still need to be sent to the ETA"))
        return super()._validate_session(balancing_account, amount_to_balance, bank_payment_method_diffs)
