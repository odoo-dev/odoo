# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)


class AccountAnalyticLine(models.Model):
    _inherit = 'account.analytic.line'

    def _get_billable_types(self):
        return super()._get_billable_types() + [(160, '14_manufacturing_order', _lt('Manufacturing Orders'))]

    def _set_billable_cost(self):
        aals_mrp = self.filtered(lambda aal: aal.category == 'manufacturing_order')
        aals_mrp.billable_type = '14_manufacturing_order'
        super(AccountAnalyticLine, self - aals_mrp)._set_billable_cost()
