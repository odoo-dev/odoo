import pytz

from odoo import api, models, fields, Command, _
from odoo.exceptions import UserError


class PosMakeInvoice(models.TransientModel):
    _name = 'pos.make.invoice'
    _description = 'Multiple order invoice creation'

    consolidated_billing = fields.Boolean(
        string="Consolidated Billing", default=True,
        help="Create one invoice for all orders related to same customer and same invoicing address"
    )
    count = fields.Integer(string="Order Count", compute='_compute_order_count')

    @api.depends('consolidated_billing')
    def _compute_order_count(self):
        for wizard in self:
            wizard.count = len(self.env.context.get('active_ids'))

    def action_create_invoices(self):
        self.ensure_one()
        if any(order_id for order_id in self.env['pos.order'].browse(self.env.context.get('active_ids')) if not order_id.partner_id):
            raise UserError(_("Some of the selected order(s) do not have customers assigned."))
        if any(order_id for order_id in self.env['pos.order'].browse(self.env.context.get('active_ids')) if order_id.state == 'draft'):
            raise UserError(_("Some of the order(s) are not paid."))
        if not any(order_id for order_id in self.env['pos.order'].browse(self.env.context.get('active_ids')) if order_id.invoice_status == 'to_invoice'):
            raise UserError(_(
                "Cannot create an invoice. No items are available to invoice.\n"
                "To resolve this issue, please ensure that there are some orders to be invoiced among the selected orders."
            ))
        pos_orders = self.env['pos.order'].browse(self.env.context.get('active_ids')).filtered(lambda o: o.invoice_status != 'invoiced')
        invoices = self.env['account.move']
        if not self.consolidated_billing:
            for order in pos_orders:
                invoices |= order._generate_pos_order_invoice()
        else:
            invoices |= pos_orders._generate_pos_order_invoice()

        if invoices:
            action = self.env['ir.actions.actions']._for_xml_id('account.action_move_out_invoice_type')
            if len(invoices) == 1:
                form_view = [(self.env.ref('account.view_move_form').id, 'form')]
                action['views'] = form_view
                action['res_id'] = invoices.id
            else:
                action['domain'] = [('id', 'in', invoices.ids)]
            return action
