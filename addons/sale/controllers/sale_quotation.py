# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, http, _
from odoo.http import request
from odoo.addons.payment.controllers.main import _message_post_helper
from odoo.addons.payment.controllers.main import Payment


class SaleQuotation(Payment):

    def _get_quotation_value(self, order_sudo, transaction, token=None, **post):
        days = 0
        if order_sudo.validity_date:
            days = (fields.Date.from_string(order_sudo.validity_date) - fields.Date.from_string(fields.Date.today())).days + 1
        values = {
            'quotation': order_sudo,
            'order_valid': (not order_sudo.validity_date) or (fields.Date.today() <= order_sudo.validity_date),
            'days_valid': days,
            'action': request.env.ref('sale.action_quotations').id,
            'tx_id': transaction.id if transaction else False,
            'tx_state': transaction.state if transaction else False,
            'tx_post_msg': transaction.acquirer_id.post_msg if transaction else False,
            'need_payment': transaction.state in ['draft', 'cancel', 'error'],
            'token': token,
            'save_option': False,
            'show_button_modal_cancel': True,
        }
        return values

    @http.route("/quote/report/html", type='json', auth="public", website=True)
    def quote_html_report(self, payment_request_id=None, token=None, **kwargs):
        # the real invoice report (displayed in HTML format)
        access_token = token if token != payment_request_id else None
        payment_request = self._get_invoice_payment_request(payment_request_id, access_token, **kwargs)
        return request.env.ref('sale.action_report_saleorder').sudo().render_qweb_html([payment_request.order_id.id])[0]

    @http.route("/quote/<int:payment_request_id>", type='http', auth="user", website=True)
    def quote_view_user(self, *args, **kwargs):
        return self.quote_view(*args, **kwargs)

    @http.route("/quote/<token>", type='http', auth="public", website=True)
    def quote_view(self, payment_request_id=None, pdf=None, token=None, message=False, **post):
        # use sudo to allow accessing/viewing orders for public user
        # only if he knows the private token
        payment_request = self._get_invoice_payment_request(payment_request_id, token, **post)

        if not payment_request or (payment_request and not payment_request.order_id):
            return request.render('payment.404')

        # Token or not, sudo the order, since portal user has not access on
        # taxes, required to compute the total_amout of SO.
        order_sudo = payment_request.order_id.sudo()
        if pdf:
            return self._print_invoice_pdf(order_sudo.id, 'sale.action_report_saleorder')

        transaction_id = request.session.get('quote_%s_transaction_id' % order_sudo.id)
        if not transaction_id:
            transaction = request.env['payment.transaction'].sudo().search([('reference', '=', order_sudo.name)])
        else:
            transaction = request.env['payment.transaction'].sudo().browse(transaction_id)

        values = self._get_quotation_value(order_sudo, transaction, **post)
        values['message'] = message and int(message) or False
        values['payment_request'] = payment_request

        if order_sudo.require_payment or values['need_payment']:
            render_values = {
                'return_url': '/quote/%s' % token if token else '/quote/%s' % payment_request_id,
                'type': 'form',
                'alias_usage': _('If we store your payment information on our server, subscription payments will be made automatically.'),
                'partner_id': order_sudo.partner_id.id,
            }

            values.update(order_sudo.with_context(submit_class="btn btn-primary", submit_txt=_('Pay & Confirm'))._prepare_payment_acquirer(values=render_values))

        return request.render('sale.so_quotation', values)

    @http.route(['/quote/transaction/<int:acquirer_id>'], type='json', auth="public", website=True)
    def quote_payment_transaction(self, acquirer_id, tx_type='form', token=None, **kwargs):
        """ Json method that creates a payment.transaction, used to create a
        transaction when the user clicks on 'pay now' button. After having
        created the transaction, the event continues and the user is redirected
        to the acquirer website.

        :param int acquirer_id: id of a payment.acquirer record. If not set the
                                user is redirected to the checkout page
        """
        # In case the route is called directly from the JS (as done in Stripe payment method)
        payment_request_id = kwargs.get('payment_request_id')
        access_token = kwargs.get('access_token') if kwargs.get('access_token') != kwargs.get('payment_request_id') else None
        payment_request = self._get_invoice_payment_request(payment_request_id, access_token)

        Order = payment_request.order_id.sudo()
        if not Order or not Order.order_line or acquirer_id is None:
            return request.redirect("/quote/%s" % access_token if access_token else '/quote/%s' % payment_request.id)

        # find an already existing transaction
        Transaction = request.env['payment.transaction'].sudo().search([
            ('reference', '=', Order.name),
            ('sale_order_id', '=', Order.id)
        ])
        Transaction = Order._prepare_payment_transaction(acquirer_id, transaction=Transaction, token=token)

        if not Transaction.callback_model_id:
            Transaction.write({
                'callback_model_id': request.env['ir.model'].sudo().search([('model', '=', Order._name)], limit=1).id,
                'callback_res_id': Order.id,
                'callback_method': '_confirm_online_quote',
            })
        request.session['quote_%s_transaction_id' % Order.id] = Transaction.id
        return Transaction.acquirer_id.with_context(submit_class='btn btn-primary', submit_txt=_('Pay & Confirm')).render(
            Transaction.reference,
            Order.amount_total,
            Order.pricelist_id.currency_id.id,
            values={
                'return_url': '/quote/%s' % access_token if access_token else '/quote/%s' % payment_request.id,
                'type': Order._get_payment_type(),
                'alias_usage': _('If we store your payment information on our server, subscription payments will be made automatically.'),
                'partner_id': Order.partner_shipping_id.id or Order.partner_invoice_id.id,
                'billing_partner_id': Order.partner_invoice_id.id,
            },
        )

    @http.route(['/quote/accept'], type='json', auth="public", website=True)
    def accept(self, order_id, token=None, signer=None, sign=None, **post):
        Order = request.env['sale.order'].sudo().browse(order_id)
        if token != Order.payment_request_id.access_token or Order.require_payment:
            return request.render('payment.404')
        if Order.state != 'sent':
            return False
        attachments = [('signature.png', sign.decode('base64'))] if sign else []
        Order.action_confirm()
        message = _('Order signed by %s') % (signer,)
        _message_post_helper(message=message, res_id=order_id, res_model='sale.order', attachments=attachments, **({'token': token, 'token_field': 'access_token'} if token else {}))
        return True
