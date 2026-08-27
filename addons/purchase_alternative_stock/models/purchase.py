# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    on_time_rate_perc = fields.Float(string="OTD", compute="_compute_on_time_rate_perc")

    @api.depends('on_time_rate')
    def _compute_on_time_rate_perc(self):
        for po in self:
            if po.on_time_rate >= 0:
                po.on_time_rate_perc = po.on_time_rate / 100
            else:
                po.on_time_rate_perc = -1


class PurchaseOrderLine(models.Model):
    _inherit = 'purchase.order.line'

    on_time_rate_perc = fields.Float(string="OTD", related="order_id.on_time_rate_perc")

    def _get_countable_rfq_groups(self, groups):
        countable_groups = {}
        for order, product, uom, orderpoint, location_final, qty_sum in groups:
            purchase_group = order.purchase_group_id
            key = (purchase_group.id if purchase_group else order.id, product.id)
            if qty_sum > countable_groups.get(key, (0,))[0]:
                countable_groups[key] = (qty_sum, order, product, uom, orderpoint, location_final)

        return (
            (order, product, uom, orderpoint, location_final, qty_sum)
            for qty_sum, order, product, uom, orderpoint, location_final
            in countable_groups.values()
        )
