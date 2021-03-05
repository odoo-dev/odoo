# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models, _


class StockMove(models.Model):
    _inherit = "stock.move"

    def _is_returned(self, valued_type):
        if self._is_unbuild():
            return True
        return super()._is_returned(valued_type)

    def _is_unbuild(self):
        if self.unbuild_id and self.unbuild_id.mo_id:
            return True

    def _get_src_account(self, accounts_data):
        if not self._is_unbuild():
            return super()._get_src_account(accounts_data)
        else:
            return self.location_dest_id.valuation_out_account_id.id or accounts_data['stock_input'].id

    def _get_dest_account(self, accounts_data):
        if not self._is_unbuild():
            return super()._get_dest_account(accounts_data)
        else:
            return self.location_id.valuation_in_account_id.id or accounts_data['stock_output'].id
