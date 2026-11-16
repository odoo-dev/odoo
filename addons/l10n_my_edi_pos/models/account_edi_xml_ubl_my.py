from odoo import api, models


class AccountEdiXmlUBLMyInvoisMY(models.AbstractModel):
    _inherit = "account.edi.xml.ubl_myinvois_my"

    # -----------------------
    # CRUD, inherited methods
    # -----------------------

    def _l10n_my_edi_add_paid_amount_vals(self, vals):
        # EXTENDS l10n_my_edi
        super()._l10n_my_edi_add_paid_amount_vals(vals)

        myinvois_document = vals["myinvois_document"]
        if myinvois_document.pos_order_ids:
            # Add the total amount paid.
            vals.update({
                'total_paid_amount': sum(order.amount_paid / order.currency_rate for order in myinvois_document.pos_order_ids),
                'total_paid_amount_currency': sum(myinvois_document.pos_order_ids.mapped('amount_paid')),
            })

    def _l10n_my_edi_get_reported_prepaid_amount(self, vals):
        # EXTENDS l10n_my_edi
        myinvois_document = vals["myinvois_document"]
        # For individual POS e-invoices, the prepaid amount must be 0.
        # POS orders are paid immediately at the point of sale, MyInvois requires
        # the PayableAmount to reflect the full invoice amount (not reduced by prepayment).
        if not myinvois_document._is_consolidated_invoice() and myinvois_document.invoice_ids.pos_order_ids:
            return 0.0
        return super()._l10n_my_edi_get_reported_prepaid_amount(vals)

    @api.model
    def _l10n_my_edi_get_refund_details(self, invoice):
        """
        Override in order to get the original document from the PoS order in case of refund of a
        PoS consolidated invoice.

        Note that by design, we consider that a refund done in a PoS is an actual refund and never a
        credit note.
        :param invoice: The credit note for which we want to get the refunded document.
        :return: A tuple, where the first parameter indicates if this credit note is a refund and the second the credited/refunded document.
        """
        if not invoice.pos_order_ids:
            return super()._l10n_my_edi_get_refund_details(invoice)  # the existing logic is enough.

        refunded_order = invoice.pos_order_ids[0].refunded_order_id
        consolidated_invoices = refunded_order._get_active_consolidated_invoice()
        return True, consolidated_invoices
