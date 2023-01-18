# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.addons.base.models.res_partner import WARNING_MESSAGE, WARNING_HELP


class res_partner(models.Model):
    _name = 'res.partner'
    _inherit = 'res.partner'

    def _compute_purchase_order_count(self):
        all_partners_subquery = self.with_context(active_test=False)._search([('id', 'child_of', self.ids)])

        purchase_order_groups = self.env['purchase.order']._aggregate(
            domain=[('partner_id', 'in', all_partners_subquery)],
            aggregates=['*:count'], groupby=['partner_id']
        )
        self.purchase_order_count = 0
        for [partner], [count] in purchase_order_groups.items(as_records=True):
            while partner:
                if partner in self:
                    partner.purchase_order_count += count
                partner = partner.with_context(prefetch_fields=False).parent_id

    def _compute_supplier_invoice_count(self):
        all_partners_subquery = self.with_context(active_test=False)._search([('id', 'child_of', self.ids)])

        supplier_invoice_groups = self.env['account.move']._aggregate(
            domain=[('partner_id', 'in', all_partners_subquery),
                    ('move_type', 'in', ('in_invoice', 'in_refund'))],
            aggregates=['*:count'], groupby=['partner_id']
        )
        self.supplier_invoice_count = 0
        for [partner], [count] in supplier_invoice_groups.items(as_records=True):
            while partner:
                if partner in self:
                    partner.supplier_invoice_count += count
                partner = partner.with_context(prefetch_fields=False).parent_id

    @api.model
    def _commercial_fields(self):
        return super(res_partner, self)._commercial_fields()

    property_purchase_currency_id = fields.Many2one(
        'res.currency', string="Supplier Currency", company_dependent=True,
        help="This currency will be used, instead of the default one, for purchases from the current partner")
    purchase_order_count = fields.Integer(compute='_compute_purchase_order_count', string='Purchase Order Count')
    supplier_invoice_count = fields.Integer(compute='_compute_supplier_invoice_count', string='# Vendor Bills')
    purchase_warn = fields.Selection(WARNING_MESSAGE, 'Purchase Order', help=WARNING_HELP, default="no-message")
    purchase_warn_msg = fields.Text('Message for Purchase Order')

    receipt_reminder_email = fields.Boolean('Receipt Reminder', default=False, company_dependent=True,
        help="Automatically send a confirmation email to the vendor X days before the expected receipt date, asking him to confirm the exact date.")
    reminder_date_before_receipt = fields.Integer('Days Before Receipt', default=1, company_dependent=True,
        help="Number of days to send reminder email before the promised receipt date")
