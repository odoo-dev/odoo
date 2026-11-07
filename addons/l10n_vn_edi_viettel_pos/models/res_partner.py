# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, api
from odoo.fields import Domain
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)


class ResPartner(models.Model):
    _inherit = 'res.partner'

    _l10n_vn_walk_in_customer = models.Ref(
        'l10n_vn_edi_viettel_pos.partner_walk_in_customer', 'res.partner',
        message=_lt("Deleting the partner %(name)s is not allowed because it is required by the Vietnam point of sale."),
    )

    @api.model
    def _load_pos_data_domain(self, data):
        # Make sure to always load the walk-in customer
        domain = super()._load_pos_data_domain(data)
        if self.env.company.country_id.code == "VN":
            walk_in_customer_id = self._l10n_vn_walk_in_customer.id
            return Domain.OR([domain, [('id', '=', walk_in_customer_id)]])
        return domain
