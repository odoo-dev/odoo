# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    service_tracking = fields.Selection(selection_add=[('subcontract', 'Subcontract Service')],
                                        ondelete={'subcontract': 'set default'})

    @api.constrains('service_tracking', 'seller_ids', 'type')
    def _check_service_to_purchase(self):
        for template in self:
            if template.service_tracking == 'subcontract':
                if template.type != 'service':
                    raise ValidationError(_("Product that is not a service can not create RFQ."))
                template._check_vendor_for_service_to_purchase(template.seller_ids)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('service_tracking') == 'subcontract':
                self._check_vendor_for_service_to_purchase(vals.get('seller_ids'))
        return super().create(vals_list)

    def _check_vendor_for_service_to_purchase(self, sellers):
        if not sellers:
            raise ValidationError(_("Please define the vendor from whom you would like to purchase this service automatically."))

    @api.onchange('type', 'expense_policy')
    def _onchange_service_to_purchase(self):
        products_template = self.filtered(lambda p: p.type != 'service' or p.expense_policy != 'no')
        products_template.service_tracking = 'no'
