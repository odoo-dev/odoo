# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class StockQuant(models.Model):
    _inherit = 'stock.quant'

    expiration_date = fields.Datetime(related='lot_id.expiration_date', store=True)
    removal_date = fields.Datetime(related='lot_id.removal_date', store=True)
    use_expiration_date = fields.Boolean(related='product_id.use_expiration_date')

    def _get_gs1_barcode(self, gs1_quantity_rules_ai_by_uom):
        barcode = super()._get_gs1_barcode(gs1_quantity_rules_ai_by_uom)
        if self.use_expiration_date:
            if self.lot_id.expiration_date:
                barcode = '17' + self.lot_id.expiration_date.strftime('%y%m%d') + barcode
            if self.lot_id.use_date:
                barcode = '15' + self.lot_id.use_date.strftime('%y%m%d') + barcode
        return barcode

    @api.model
    def _get_removal_strategy_domain_order(self, domain, removal_strategy, qty):
        if removal_strategy == 'fefo':
            return domain, 'removal_date, in_date, id'
        return super()._get_removal_strategy_domain_order(domain, removal_strategy, qty)

    def _get_removal_strategy_sort_key(self, removal_strategy):
        if removal_strategy == 'fefo':
            return lambda q: (q.removal_date or fields.datetime.max, q.in_date, q.id), False
        return super()._get_removal_strategy_sort_key(removal_strategy)
