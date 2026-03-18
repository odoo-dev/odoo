import hmac
import logging
from werkzeug.exceptions import Forbidden

from odoo import http
from odoo.http import request
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)


class QFPayController(http.Controller):

    @http.route(
        '/payment/qfpay/return', type='http', auth='public', methods=['GET', 'POST'],
        csrf=False, save_session=False
    )
    def qfpay_return_from_checkout(self, **data):
        _logger.info("User returned from QFPay for transaction reference: %s", data.get('out_trade_no'))
        return request.redirect("/payment/status")

    @http.route(
        '/payment/qfpay/webhook', type='http', auth='public', methods=['POST'], 
        csrf=False, save_session=False
    )
    def qfpay_webhook(self, **data):
        _logger.info("QFPay webhook received with data:\n%s", data)
        reference = request.env['payment.transaction']._extract_reference('qfpay', data)

        if not reference:
            _logger.warning("QFPay: Missing reference in webhook data.")
            return ""

        tx_sudo = request.env['payment.transaction'].sudo().search([('reference', '=', reference)])
        if not tx_sudo:
            _logger.warning("QFPay Webhook validation failed: No transaction found for reference %s", reference)
            return ""

        self._verify_signature(data, tx_sudo)
        tx_sudo._process(data)

        return "SUCCESS"

    @staticmethod
    def _verify_signature(data, tx_sudo):
        """ Verify the signature. """
        received_sign = data.get('sign')
        if not received_sign:
            _logger.warning("QFPay: Missing signature.")
            raise Forbidden

        expected_sign = tx_sudo.provider_id._qfpay_generate_sign(data)
        if not hmac.compare_digest(received_sign, expected_sign):
            _logger.warning("QFPay: Invalid signature received from gateway.")
            raise Forbidden
