# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class PurchaseRequisitionLine(models.Model):
    _inherit = "purchase.requisition.line"

    def _prepare_purchase_order_line(self, name, product_qty=0.0, price_unit=0.0, taxes_ids=False):
        res = super(PurchaseRequisitionLine, self)._prepare_purchase_order_line(name, product_qty, price_unit, taxes_ids)
        if self.requisition_id.origin:
            procurement_group = self.env['procurement.group'].search([('name', '=', self.requisition_id.origin)])
            sale_order_line = procurement_group.sale_id.order_line.filtered(lambda line: line.product_id.id == res['product_id'] and line.product_uom.id == res['product_uom'] and line.product_uom_qty == res['product_qty'])
            res['sale_line_id'] = sale_order_line.id
        return res
