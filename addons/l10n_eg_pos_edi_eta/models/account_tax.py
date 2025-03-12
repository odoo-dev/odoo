from odoo import models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    def _get_l10n_eg_eta_code_types(self):
        """
            Helper method to return the taxType, subType from the ETA Tax Code
            :return: The ETA Tax Code `Type` and `Sub Type`
            :rtype: tuple(taxType, subType)
        """
        self.ensure_one()
        return tuple(map(str.upper, self.l10n_eg_eta_code.split('_')))
