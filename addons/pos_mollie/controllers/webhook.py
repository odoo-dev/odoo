from odoo import http
from odoo.http import request
from odoo.tools import verify_hash_signed
import logging

_logger = logging.getLogger(__name__)


class PosMollie(http.Controller):
    @http.route('/pos_mollie/webhook', methods=['POST'], auth='public', type='http', save_session=False, csrf=False)
    def mollie_webhook(self, id, payload):
        _logger.info("Received webhook from Mollie for payment '%s'", id)

        payment_method_sudo = request.env["pos.payment.method"].sudo()
        decoded_payload = verify_hash_signed(payment_method_sudo.env, "pos_mollie", payload)
        if not decoded_payload:
            _logger.warning("Invalid payload received in Mollie webhook, ignoring")
            return "OK"

        payment_method_id = decoded_payload["payment_method_id"]
        pos_session_id = decoded_payload["pos_session_id"]
        payment_method_sudo = payment_method_sudo.browse(payment_method_id).exists()
        if not payment_method_sudo:
            _logger.warning("No payment method found matching Mollie webhook, ignoring")
            return "OK"
        pos_session_sudo = request.env["pos.session"].sudo().browse(pos_session_id).exists()
        if not pos_session_sudo:
            _logger.warning("No POS session found matching Mollie webhook, ignoring")
            return "OK"

        payment_info = payment_method_sudo._mollie_get_payment(id)
        payment_details = payment_info["details"]

        message = {
            'session_id': int(pos_session_id),
            'payment_id': id,
            'status': payment_info["status"],
        }
        if message['status'] == "paid":
            card_info = {
                'card_type': payment_details.get("cardFunding"),
                'card_no': payment_details.get("cardNumber"),
                'card_brand': payment_details.get("cardLabel"),
            }
            message |= card_info
            self_order = decoded_payload.get("self_order")
            if self_order and not self._mollie_validate_self_payment(decoded_payload.get("order_id"), pos_session_sudo,
                                                                     payment_method_sudo,
                                                                     payment_info, card_info):
                return "OK"

        elif message['status'] in ['expired', 'failed', 'canceled']:
            message |= {
                'status_reason': payment_info.get("statusReason"),
            }
        pos_session_sudo.config_id._notify('MOLLIE_PAYMENT_STATUS', message)

        return "OK"

    def _mollie_validate_self_payment(self, order_id, pos_session_sudo, payment_method_sudo, payment_info, card_info):
        pos_order = pos_session_sudo.config_id.env['pos.order'].browse(order_id).exists()
        if not pos_order:
            _logger.warning("No order found matching Mollie webhook, ignoring")
            return False
        order_mollie_amount = payment_method_sudo._mollie_format_amount(pos_order.amount_total)['amount']
        payment_amount = payment_info['amount']
        if order_mollie_amount['value'] != payment_amount['value'] or order_mollie_amount['currency'] != payment_amount['currency']:
            _logger.warning("Payment amount does not match order amount, ignoring")
            return False
        payment_method_sudo._finalize_kiosk_payment(pos_order, {
            **card_info,
            'amount': pos_order.amount_total,
        })
        return True
