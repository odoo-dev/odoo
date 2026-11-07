# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models


class PosSession(models.Model):
    _inherit = 'pos.session'

    _l10n_vn_edi_viettel_pos__partner_walk_in_customer = models.Ref('l10n_vn_edi_viettel_pos.partner_walk_in_customer', 'res.partner')

    @api.model
    def _load_pos_data_read(self, records, config):
        data = super()._load_pos_data_read(records, config)
        if data and self.env.company.country_id.code == 'VN':
            walk_in_customer_id = self._l10n_vn_edi_viettel_pos__partner_walk_in_customer.id
            data[0]['_default_customer_id'] = walk_in_customer_id
        return data
