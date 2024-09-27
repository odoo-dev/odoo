# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models, Command


class PurchaseRequisitionCreateAlternative(models.TransientModel):
    _name = 'purchase.requisition.create.alternative'
    _description = 'Wizard to preset values for alternative PO'

    origin_po_id = fields.Many2one(
        'purchase.order', help="The original PO that this alternative PO is being created for."
    )
    partner_ids = fields.Many2many(
        'res.partner', string='Vendor', required=True,
        help="Choose a vendor for alternative PO")
    purchase_warn_msg = fields.Text(
        'Warning Messages',
        compute="_compute_purchase_warn_msg",
        groups="purchase.group_warning_purchase")
    copy_products = fields.Boolean(
        "Copy Products", default=True,
        help="If this is checked, the product quantities of the original PO will be copied")

    @api.depends('partner_ids', 'copy_products')
    def _compute_purchase_warn_msg(self):
        self.purchase_warn_msg = ''
        # follows partner warning logic from PurchaseOrder
        if not self.env.user.has_group('purchase.group_warning_purchase'):
            return
        partners = self.partner_ids
        for partner in partners:
        # If partner has no warning, check its company
            if not partner.purchase_warn_msg:
                partner = partner.parent_id
            if partner and partner.purchase_warn_msg:
                self.purchase_warn_msg = _("Warning for %(partner)s:\n%(warning_message)s\n", partner=partner.name, warning_message=partner.purchase_warn_msg)
            if self.copy_products and self.origin_po_id.order_line:
                for line in self.origin_po_id.order_line:
                    if line.product_id.purchase_line_warn_msg:
                        self.purchase_warn_msg += _("Warning for %(product)s:\n%(warning_message)s\n", product=line.product_id.name, warning_message=line.product_id.purchase_line_warn_msg)

        if self.copy_products and self.origin_po_id.order_line:
            for line in self.origin_po_id.order_line:
                if line.product_id.purchase_line_warn_msg:
                    self.purchase_warn_msg += _("Warning for %(product)s:\n%(warning_message)s\n", product=line.product_id.name, warning_message=line.product_id.purchase_line_warn_msg)

    def action_create_alternative(self):
        vals = self._get_alternative_values()
        alt_pos = self.env['purchase.order'].with_context(origin_po_id=self.origin_po_id.id, default_requisition_id=False).create(vals)
        alt_pos.order_line._compute_tax_id()
        last_alt_po = alt_pos[-1] # Get the last created purchase order
        return {
            'type': 'ir.actions.act_window',
            'view_mode': 'form',
            'res_model': 'purchase.order',
            'res_id': last_alt_po.id, # Use the last created record's ID
            'context': {
                'active_id': last_alt_po.id,
            },
        }

    def _get_alternative_values(self):
        vals = []
        for partner in self.partner_ids:
            val = {
                'date_order': self.origin_po_id.date_order,
                'partner_id': partner.id,
                'user_id': self.origin_po_id.user_id.id,
                'dest_address_id': self.origin_po_id.dest_address_id.id,
                'origin': self.origin_po_id.origin,
                'currency_id': partner.property_purchase_currency_id.id or self.env.company.currency_id.id
            }
            if self.copy_products and self.origin_po_id:
                product_tmpl_ids_with_description = set(self.env['product.supplierinfo'].search_fetch([
                    ('product_tmpl_id', 'in', self.origin_po_id.order_line.product_id.product_tmpl_id.ids),
                    ('partner_id', '=', partner.id),
                    '|', ('product_code', '!=', False), ('product_name', '!=', False)
                ], ['product_tmpl_id']).product_tmpl_id.ids)
                val['order_line'] = [Command.create(self._get_alternative_line_value(line, product_tmpl_ids_with_description)) for line in self.origin_po_id.order_line]
                vals.append(val)  # Append the current val to the list

        return vals

    @api.model
    def _get_alternative_line_value(self, order_line, product_tmpl_ids_with_description):
        has_product_description = order_line.product_id.product_tmpl_id.id in product_tmpl_ids_with_description
        return {
            'product_id': order_line.product_id.id,
            'product_qty': order_line.product_qty,
            'product_uom_id': order_line.product_uom_id.id,
            'display_type': order_line.display_type,
            'analytic_distribution': order_line.analytic_distribution,
            **({'name': order_line.name} if order_line.display_type in ('line_section', 'line_note') or not has_product_description else {}),
        }
