# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import werkzeug

from odoo import fields, http, _
from odoo.http import request
from odoo.addons.payment.controllers.main import _message_post_helper
from odoo.addons.website_portal.controllers.main import get_records_pager
from odoo.addons.sale.controllers.main import SaleQuotation


class WebsiteSaleQuotation(SaleQuotation):

    def _get_quotation_value(self, order_sudo, transaction, token=None, **post):
        values = super(WebsiteSaleQuotation, self)._get_quotation_value(
            order_sudo, transaction, token, **post)

        history = request.session.get('my_quotes_history', [])
        values.update(get_records_pager(history, order_sudo))
        values.update({
            'breadcrumb': request.env.user.partner_id == order_sudo.partner_id,
            'option': any(not x.line_id for x in order_sudo.options),
            'need_payment': order_sudo.invoice_status == 'to invoice' and transaction.state in ['draft', 'cancel', 'error'],
            'save_option': True,
        })
        return values

    @http.route()
    def quote_view(self, payment_request_id=None, pdf=None, token=None, message=False, **post):
        # use sudo to allow accessing/viewing orders for public user
        # only if he knows the private token
        payment_request = self._get_invoice_payment_request(payment_request_id, token, **post)

        if not payment_request or (payment_request and not payment_request.order_id):
            return request.render('website.404')

        Order = payment_request.order_id
        now = fields.Date.today()

        if Order and request.session.get('view_quote') != now and request.env.user.share:
            request.session['view_quote'] = now
            body = _('Quotation viewed by customer')
            _message_post_helper(
                res_model='sale.order', res_id=Order.id,
                message=body, token=token, token_field="access_token",
                message_type='notification', subtype="mail.mt_note",
                partner_ids=Order.user_id.sudo().partner_id.ids)

        # Token or not, sudo the order, since portal user has not access on
        # taxes, required to compute the total_amout of SO.
        order_sudo = Order.sudo()

        if pdf:
            return self._print_invoice_pdf(order_sudo.id, 'website_quote.report_web_quote')

        return super(WebsiteSaleQuotation, self).quote_view(payment_request_id=payment_request_id, pdf=pdf, token=token, **post)


class sale_quote(http.Controller):

    @http.route(['/quote/<int:order_id>/<token>/decline'], type='http', auth="public", methods=['POST'], website=True)
    def decline(self, order_id, token, **post):
        Order = request.env['sale.order'].sudo().browse(order_id)
        if token != Order.access_token:
            return request.render('website.404')
        if Order.state != 'sent':
            return werkzeug.utils.redirect("/quote/%s?message=4" % token)
        Order.action_cancel()
        message = post.get('decline_message')
        if message:
            _message_post_helper(message=message, res_id=order_id, res_model='sale.order', **{'token': token, 'token_field': 'access_token'} if token else {})
        return werkzeug.utils.redirect("/quote/%s?message=2" % token)

    @http.route(['/quote/update_line'], type='json', auth="public", website=True)
    def update(self, line_id, remove=False, unlink=False, order_id=None, token=None, **post):
        Order = request.env['sale.order'].sudo().browse(int(order_id))
        if token != Order.access_token:
            return request.render('website.404')
        if Order.state not in ('draft', 'sent'):
            return False
        OrderLine = request.env['sale.order.line'].sudo().browse(int(line_id))
        if unlink:
            OrderLine.unlink()
            return False
        number = -1 if remove else 1
        quantity = OrderLine.product_uom_qty + number
        OrderLine.write({'product_uom_qty': quantity})
        return [str(quantity), str(Order.amount_total)]

    @http.route(["/quote/template/<model('sale.quote.template'):quote>"], type='http', auth="user", website=True)
    def template_view(self, quote, **post):
        values = {'template': quote}
        return request.render('website_quote.so_template', values)

    @http.route(["/quote/add_line/<int:option_id>/<int:order_id>/<token>"], type='http', auth="public", website=True)
    def add(self, option_id, order_id, token, **post):
        Order = request.env['sale.order'].sudo().browse(order_id)
        if token != Order.access_token:
            return request.render('website.404')
        if Order.state not in ['draft', 'sent']:
            return request.render('website.http_error', {'status_code': 'Forbidden', 'status_message': _('You cannot add options to a confirmed order.')})
        Option = request.env['sale.order.option'].sudo().browse(option_id)
        vals = {
            'price_unit': Option.price_unit,
            'website_description': Option.website_description,
            'name': Option.name,
            'order_id': Order.id,
            'product_id': Option.product_id.id,
            'layout_category_id': Option.layout_category_id.id,
            'product_uom_qty': Option.quantity,
            'product_uom': Option.uom_id.id,
            'discount': Option.discount,
        }

        OrderLine = request.env['sale.order.line'].sudo().create(vals)
        OrderLine._compute_tax_id()
        Option.write({'line_id': OrderLine.id})
        return werkzeug.utils.redirect("/quote/%s/%s#pricing" % (Order.id, token))
