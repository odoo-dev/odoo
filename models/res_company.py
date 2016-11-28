# -*- coding: utf-8 -*-
##############################################################################
# For copyright and license notices, see __openerp__.py file in module root
# directory
##############################################################################
from openerp import fields, models


class ResCompany(models.Model):
    _inherit = "res.company"

    # @api.model
    # def _get_localizations(self):
    #     return [('generic', 'Generic')]

    # _localization_selection = (
    #     lambda self, *args, **kwargs: self._get_localizations(
    #         *args, **kwargs))

    # we do it this way because with the other method if, for eg, we install
    # account_withholding after l10n_ar_account installed, on journal creation
    # odoo runs a check over localization related field of journals and
    # raise the error that "argentina" was not a valid value for "localization"
    # this way we force all selection values to be loaded first

    _localization_selection = [('generic', 'Generic')]

    localization = fields.Selection(
        _localization_selection,
        'Localization',
    )
