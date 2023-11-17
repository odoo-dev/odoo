# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class PosSession(models.Model):
    _inherit = 'pos.session'

    def load_data_params(self):
        params = super().load_data_params()

        if self.company_id.country_code == 'IN':
            params['search_read']['product.product']['fields'] += ['l10n_in_hsn_code']

        return params

    def _loader_params_product_product(self):
        result = super()._loader_params_product_product()
        result['search_params']['fields'].append('l10n_in_hsn_code')
        return result
