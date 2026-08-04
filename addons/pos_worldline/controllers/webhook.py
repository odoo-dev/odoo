# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class PosWorldline(http.Controller):

    @http.route('/pos_worldline/webhook', methods=['POST'], auth='public', type='http', save_session=False, csrf=False)
    def worldline_webhook(self):
        # TODO: validate the notification data
        data = request.get_json_data()
        _logger.info("Received Worldline webhook notification: %s", data)

        service_response = (data.get('data') or {}).get('SaleToPOIServiceResponse', {}).get('ServiceResponse', {})
        poi_id = service_response.get('Environment', {}).get('POI', {}).get('Identification', {}).get('Identification')

        payment_method_sudo = request.env['pos.payment.method'].sudo().search([('worldline_terminal_id', '=', poi_id)], limit=1)
        if not payment_method_sudo:
            _logger.warning("Received a Worldline webhook for an unregistered terminal: %s", poi_id)
            return request.make_json_response({})

        payment_transaction = service_response.get('PaymentResponse', {}).get('PaymentTransaction', {})
        transaction_reference = payment_transaction.get('TransactionIdentification', {}).get('TransactionReference', '')
        # TransactionReference is "<payment_uuid>/<pos_session_id>", see _get_worldline_transaction_json.
        payment_uuid, _sep, pos_session_id = transaction_reference.partition('/')

        pos_session_sudo = request.env['pos.session'].sudo().browse(
            int(pos_session_id) if pos_session_id.isdigit() else None
        ).exists()
        if not payment_uuid or not pos_session_sudo:
            _logger.warning("Received a Worldline webhook with an unresolvable TransactionReference: %s", transaction_reference)
            return request.make_json_response({})

        authorisation_response = payment_transaction.get('TransactionResponse', {}).get('AuthorisationResult', {}).get('ResponseToAuthorisation', {}).get('Response')
        success = service_response.get('Response', {}).get('Result') == 'Success' and authorisation_response == 'Approved'

        payment_method_sudo._worldline_send_notification(pos_session_sudo, {
            'payment_uuid': payment_uuid,
            'pos_session_id': pos_session_sudo.id,
            'transaction_id': transaction_reference,
            'success': success,
        })
        return request.make_json_response({})
