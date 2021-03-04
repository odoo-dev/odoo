# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    @api.model
    def default_get(self, fields):
        values = super(PurchaseOrder, self).default_get(fields)
        if values.get('requisition_id'):
            requisition = self.env['purchase.requisition'].browse(values['requisition_id'])
            values.update(
                picking_type_id=requisition.picking_type_id.id,
            )
            if requisition.origin:
                procurement_group = self.env['procurement.group'].search([('name', '=', requisition.origin)])
                values.update(
                    group_id=procurement_group.id,
                    dest_address_id=procurement_group.sale_id.partner_id.id,
                )
        return values
