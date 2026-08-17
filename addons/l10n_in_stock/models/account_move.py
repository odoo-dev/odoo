from odoo import models


class AccountMove(models.Model):
    _inherit = 'account.move'

    def _l10n_in_picking_ids(self):
        """
        To be inherited by `l10n_in_*_stock` will be ideal to use it for `l10n_in_ewaybill_stock`
        returns related stock.move if any exists
        """
        pass
