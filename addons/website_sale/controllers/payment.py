# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _
from odoo.exceptions import AccessError, MissingError, ValidationError, UserError
from odoo.fields import Command
from odoo.http import request, route
from odoo.tools import float_compare

from odoo.addons.payment.controllers import portal as payment_portal


# TODO ANVFE part of payment routes ? /shop/payment ? express_checkout ?

class PaymentPortal(payment_portal.PaymentPortal):

    def _validate_transaction_for_order(self, transaction, sale_order):
        """
        Perform final checks against the transaction & sale_order.
        Override me to apply payment unrelated checks & processing
        """
        # if sale_order.company_id.account_fiscal_country_id.code == "IN" and sale_order.partner_id.l10n_in_gst_treatment in (
        #     "regular",
        #     "composition",
        #     "overseas",
        #     "special_economic_zone",
        #     "deemed_export",):
        #     invoice_journal = self.env['account.journal'].search([('type', '=', 'sale'), ('company_id', '=', sale_order.company_id.id)], limit=1)
        #     for edi_format in invoice_journal.edi_format_ids:
        #         if edi_format.code == 'in_einvoice_1_03':
        #             errors = edi_format._l10n_in_validate_partner(sale_order.partner_invoice_id)
        #             if errors:
        #                 raise UserError(_("Invalid details:\n\n%s", '\n'.join(errors)))
        return

    @route('/shop/payment/transaction/<int:order_id>', type='jsonrpc', auth='public', website=True)
    def shop_payment_transaction(self, order_id, access_token, **kwargs):
        """ Create a draft transaction and return its processing values.

        :param int order_id: The sales order to pay, as a `sale.order` id
        :param str access_token: The access token used to authenticate the request
        :param dict kwargs: Locally unused data passed to `_create_transaction`
        :return: The mandatory values for the processing of the transaction
        :rtype: dict
        :raise: ValidationError if the invoice id or the access token is invalid
        """
        # Check the order id and the access token
        try:
            order_sudo = self._document_check_access('sale.order', order_id, access_token)
        except MissingError:
            raise
        except AccessError as e:
            raise ValidationError(_("The access token is invalid.")) from e

        if order_sudo.state == "cancel":
            raise ValidationError(_("The order has been cancelled."))

        order_sudo._check_cart_is_ready_to_be_paid()

        self._validate_transaction_kwargs(kwargs)
        kwargs.update({
            'partner_id': order_sudo.partner_invoice_id.id,
            'currency_id': order_sudo.currency_id.id,
            'sale_order_id': order_id,  # Include the SO to allow Subscriptions to tokenize the tx
        })
        if not kwargs.get('amount'):
            kwargs['amount'] = order_sudo.amount_total

        if float_compare(kwargs['amount'], order_sudo.amount_total, precision_rounding=order_sudo.currency_id.rounding):
            raise ValidationError(_("The cart has been updated. Please refresh the page."))

        tx_sudo = self._create_transaction(
            custom_create_values={'sale_order_ids': [Command.set([order_id])]}, **kwargs,
        )

        # Store the new transaction into the transaction list and if there's an old one, we remove
        # it until the day the ecommerce supports multiple orders at the same time.
        request.session['__website_sale_last_tx_id'] = tx_sudo.id

        self._validate_transaction_for_order(tx_sudo, order_sudo)

        return tx_sudo._get_processing_values()
