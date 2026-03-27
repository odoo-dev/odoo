# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.exceptions import ValidationError


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    service_to_purchase = fields.Boolean(
        "Subcontract Service", company_dependent=True, copy=False)

    def _get_service_tracking_selection(self):
        selection_list = list(self.env['product.template'].fields_get(['service_tracking'])['service_tracking']['selection'])
        selection_list.append(('subcontract', self.env._('Subcontracting RFQ')))
        return selection_list

    display_service_tracking = fields.Selection(
        selection=_get_service_tracking_selection,
        string="Create on Order",
        compute="_compute_display_service_tracking",
        inverse="_inverse_display_service_tracking",
        store=True,
    )

    @api.depends_context('company')
    @api.depends('service_tracking', 'service_to_purchase', 'purchase_ok')
    def _compute_display_service_tracking(self):
        for record in self:
            if record.service_to_purchase and record.purchase_ok and record.service_tracking == 'no':
                record.display_service_tracking = 'subcontract'
            else:
                record.display_service_tracking = record.service_tracking

    def _inverse_display_service_tracking(self):
        for record in self:
            if record.display_service_tracking == 'subcontract':
                record.service_to_purchase = True
                if not record.purchase_ok:
                    record.purchase_ok = True
            else:
                record.service_to_purchase = False
                record.service_tracking = record.display_service_tracking

    @api.depends('service_to_purchase')
    def _compute_purchase_ok(self):
        super()._compute_purchase_ok()
        self.filtered(lambda t: t.service_to_purchase and not t.purchase_ok).purchase_ok = True

    @api.constrains('service_to_purchase', 'seller_ids')
    def _check_service_tracking_subcontract(self):
        for template in self:
            if template.service_to_purchase:
                template._check_vendor_for_service_tracking_subcontract(template.seller_ids)

    @api.model_create_multi
    def create(self, vals_list):
        templates = super().create(vals_list)
        for template in templates.filtered(lambda t: t.service_to_purchase):
            template._check_vendor_for_service_tracking_subcontract(template.seller_ids)
        return templates

    def _check_vendor_for_service_tracking_subcontract(self, sellers):
        if not sellers:
            raise ValidationError(self.env._("Please define the vendor from whom you would like to purchase this service automatically."))

    def _prepare_service_tracking_tooltip(self):
        if self.service_to_purchase:
            return self.env._("Each time you sell this product through a SO, a RfQ is automatically created to buy the product. Tip: don't forget to set a vendor on the product.")
        return super()._prepare_service_tracking_tooltip()

    @api.onchange('type', 'reinvoice_policy')
    def _onchange_service_to_purchase(self):
        products_template = self.filtered(lambda p: p.type != 'service' or p.reinvoice_policy != 'no' or not p.purchase_ok)
        products_template.service_to_purchase = False
