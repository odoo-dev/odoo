import math
import uuid
from odoo import models
from odoo.exceptions import UserError

class PosMakePayment(models.TransientModel):
    _inherit = 'pos.make.payment'

    def check(self):

        self.ensure_one()

        breakpoint()
        order = self.env['pos.order'].browse(self.env.context.get('active_id', False))
        if order.lines.filtered(lambda line: line.refunded_orderline_id) and self.payment_method_id.use_payment_terminal:
            order
            refunded_order = order.lines[0].refunded_orderline_id.order_id
            refunded_order_payment_id = refunded_order.payment_ids.filtered(lambda payment: payment.payment_method_id.id == self.payment_method_id.id)
            payment_status_payload_data = {
                'p2pRequestId': refunded_order_payment_id.razorpay_p2p_request_id,
            }
            payment_status = self.payment_method_id.razorpay_fetch_payment_status(payment_status_payload_data)
            payment_cancel_payload_data = {}
            order_id = order.pos_reference.replace(' ', '').replace('-', '').upper()
            reference_prefix = order.config_id.name.replace(' ', '').replace('-', '')[: 4]
            reference_id = order_id + '/' + reference_prefix + uuid.uuid4().hex[: 8]
            payment_cancel_payload_data.update({
                'amount': math.fabs(self.amount),
                'externalRefNumber': reference_id,
                'transaction_id': refunded_order_payment_id.transaction_id,
                'refund_type': 'void' if payment_status.get('settlementStatus') == 'PENDING' else 'refund',
            })
            refund_status = self.payment_method_id.razorpay_make_refund_request(payment_cancel_payload_data)
            init_data = self.read()[0]
            payment_method = self.env['pos.payment.method'].browse(init_data['payment_method_id'][0])
            order.add_payment({
                'name': init_data['payment_name'],
                'amount': order._get_rounded_amount(init_data['amount'], payment_method.is_cash_count or not self.config_id.only_round_cash_method),
                'pos_order_id': order.id,
                'payment_method_id': init_data['payment_method_id'][0],
                'card_type': refund_status.get('paymentCardType'),
                'cardholder_name': refund_status.get('nameOnCard').replace("/", ""),
                'transaction_id': refund_status.get('txnId'),
                'payment_method_authcode': refund_status.get('authCode'),
                'card_brand': refund_status.get('paymentCardBrand') or '',
                'payment_method_issuer_bank': refund_status.get('acquirerCode'),
                'card_no': refund_status.get('cardLastFourDigit') or '',
                'payment_method_payment_mode': refund_status.get('paymentMode'),
                'payment_ref_no': refund_status.get('externalRefNumber'),
                'payment_status': 'done',
            })
            if order.state == 'draft' and order._is_pos_order_paid():
                order._process_saved_order(False)
                if order.state in {'paid', 'done'}:
                    order._send_order()
                return {'type': 'ir.actions.act_window_close'}
            raise UserError(_("You cannot refund a refund order with a payment terminal."))
        else:
            super(PosMakePayment, self).check()
