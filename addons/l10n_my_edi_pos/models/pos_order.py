# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, Command, fields, models
from odoo.exceptions import UserError


class PosOrder(models.Model):
    _inherit = 'pos.order'

    # ------------------
    # Fields declaration
    # ------------------

    consolidated_invoice_ids = fields.Many2many(
        name="Consolidated Invoices",
        comodel_name="myinvois.document",
        relation="myinvois_document_pos_order_rel",
        column1="order_id",
        column2="document_id",
    )

    # -----------------------
    # CRUD, inherited methods
    # -----------------------

    def _process_order(self, order, draft, existing_order):
        """ There are a few cases where we want to block the creation of the order to maintain correct data for the EDI. """
        # Start by looking in the data to see if we have any refund lines; and if so we want to gather all refunded orders.
        session = self.env['pos.session'].browse(order['data']['pos_session_id'])
        if not session.config_id.company_id._l10n_my_edi_enabled():
            return super()._process_order(order, draft, existing_order)

        order_data = order['data']
        refunded_order_line_ids = []
        for line in order_data['lines']:
            line_data = line[-1]
            if not line_data.get('refunded_orderline_id'):
                continue
            refunded_order_line_ids.append(line_data['refunded_orderline_id'])

        refunded_orders = self.env['pos.order.line'].browse(refunded_order_line_ids).order_id
        if not refunded_orders:  # Nothing more to do for now.
            return super()._process_order(order, draft, existing_order)

        # If the order contains refund lines, we need to assert that we invoice (or not) the order based on the state of
        # the orders being refunded.
        to_invoice = order_data.get('to_invoice')

        for refunded_order in refunded_orders:
            submitted = (refunded_order.is_invoiced and refunded_order.account_move.l10n_my_edi_state in ["in_progress", "valid", "rejected"]
                         or refunded_order._get_active_consolidated_invoice() and refunded_order._get_active_consolidated_invoice().myinvois_state in ["in_progress", "valid", "rejected"])

            if submitted and not to_invoice:
                raise UserError(_('You must invoice a refund for an order that has been submitted to MyInvois.'))
            elif not submitted and to_invoice:
                raise UserError(_('You cannot invoice a refund for an order that has not been submitted to MyInvois yet.'))

            if refunded_order._get_active_consolidated_invoice():
                if not to_invoice:
                    # When we refund an order which is included in a not-yet-sent consolidated invoice, we link the refund to it.
                    order['data']['consolidated_invoice_ids'] = refunded_order._get_active_consolidated_invoice().id
                else:
                    # If we invoice it (meaning the conso invoice has been sent) we must make sure to use the correct partner.
                    partner = self.env['res.partner'].browse(order['data']['partner_id'])
                    if partner._l10n_my_edi_get_tin_for_myinvois() != 'EI00000000010':
                        raise UserError(_('When refunding an order included in a consolidated invoice, you must set the customer to the General Public.'))

        return super()._process_order(order, draft, existing_order)

    @api.model
    def _order_fields(self, ui_order):
        order_fields = super()._order_fields(ui_order)
        if ui_order.get('consolidated_invoice_ids'):
            order_fields['consolidated_invoice_ids'] = [Command.link(ui_order['consolidated_invoice_ids'])]
        return order_fields

    @api.model
    def _generate_pos_order_invoice(self):
        # EXTENDS 'point_of_sale'
        if self.company_id._l10n_my_edi_enabled():
            for order in self:
                if order._get_active_consolidated_invoice():
                    raise UserError(_("This order has been included in a consolidated invoice and cannot be invoiced separately."))

                partner = order.partner_id
                if (
                    not partner.l10n_my_identification_type
                    or not partner.l10n_my_identification_number
                ):
                    raise UserError(_("You must set the identification information on the commercial partner."))
                if not partner._l10n_my_edi_get_tin_for_myinvois():
                    raise UserError(_("You must set a TIN number on the commercial partner."))

            # We need to wait for MyInvois to give us a code during submission before generating the PDF file.
            # To do so, we will invoice without PDF, send and only then generate the PDF file.
            action_values = super(PosOrder, self.with_context(generate_pdf=False))._generate_pos_order_invoice()

            # At this point we don't want to raise anymore, if there are issues it'll be logged on the invoice and we will
            # move on.
            errors = self.account_move._l10n_my_edi_send_invoice(commit=False)

            # When it fails during the validation step, we don't raise yet, but for PoS we want the error reason.
            if errors and self.account_move in errors:
                raise UserError(self.env['account.move.send']._format_error_text({
                    'error_title': _('Error when sending the invoices to the E-invoicing service.'),
                    'errors': errors[self.account_move],
                }))

            for move in self.account_move:
                template = self.env.ref(move._get_mail_template())
                move.with_context(skip_invoice_sync=True)._generate_pdf_and_send_invoice(template)

            return action_values
        return super()._generate_pos_order_invoice()

    # --------------
    # Action methods
    # --------------

    def action_show_consolidated_invoice(self):
        if len(self._get_active_consolidated_invoice()) == 1:
            action_vals = {
                'type': 'ir.actions.act_window',
                'res_model': 'myinvois.document',
                'view_mode': 'form',
                'res_id': self._get_active_consolidated_invoice().id,
                'views': [(self.env.ref('l10n_my_edi_pos.myinvois_document_pos_form_view').id, 'form')],
            }
        else:
            action_vals = {
                'name': _("Consolidated Invoices"),
                'type': 'ir.actions.act_window',
                'res_model': 'myinvois.document',
                'view_mode': 'list,form',
                'views': [(self.env.ref('l10n_my_edi_pos.myinvois_document_pos_list_view').id, 'list'), (self.env.ref('l10n_my_edi_pos.myinvois_document_pos_form_view').id, 'form')],
                'domain': [('id', 'in', self._get_active_consolidated_invoice().ids)],
            }
        return action_vals

    # ----------------
    # Business methods
    # ----------------

    def _get_active_consolidated_invoice(self):
        """ Small helper to get the currently active consolidated invoice if more that one is linked to an order. """
        return self.consolidated_invoice_ids.filtered(lambda i: i.myinvois_state != 'cancelled')[:1]
