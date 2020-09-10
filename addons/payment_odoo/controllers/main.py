# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging
import pprint

from odoo import http
from odoo.http import request

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment_odoo.const import CURRENCY_DECIMALS

_logger = logging.getLogger(__name__)


class OdooController(http.Controller):
    _notification_url = '/payment/odoo/notification'

    @http.route(_notification_url, type='json', auth='public')
    def odoo_notification(self):
        """ Process the data sent by Adyen to the webhook based on the event code.

        See https://docs.adyen.com/development-resources/webhooks/understand-notifications for the
        exhaustive list of event codes.

        :return: None
        """
        # Payload data represent a single notification's data. Because wo notifications of a same
        # batch can be related to different sub-merchants, the proxy splits the batches and send
        # individual notifications one by one to this endpoint.
        notification_data = json.loads(request.httprequest.data)

        # Check the source and integrity of the notification
        signature = notification_data.get('additionalData', {}).get('metadata.merchant_signature')
        if not signature:
            _logger.warning(f"ignored notification with missing signature")
            return
        tx_sudo = request.env['payment.transaction'].sudo()._get_tx_from_feedback_data(
            'odoo', notification_data
        )
        db_secret = request.env['ir.config_parameter'].sudo().get_param('database.secret')
        converted_amount = payment_utils.to_minor_currency_units(
            tx_sudo.amount, tx_sudo.currency_id, CURRENCY_DECIMALS.get(tx_sudo.currency_id.name)
        )
        if not payment_utils.check_access_token(
            signature, db_secret, converted_amount, tx_sudo.currency_id.name, tx_sudo.reference
        ):
            _logger.warning(f"ignored notification with invalid signature")
            return

        _logger.info(f"notification received:\n{pprint.pformat(notification_data)}")
        if notification_data['success'] != 'true':
            return  # Don't handle failed events

        # Reshape the notification data for parsing
        event_code = notification_data['eventCode']
        if event_code == 'AUTHORISATION':
            notification_data['resultCode'] = 'Authorised'
        elif event_code == 'CANCELLATION':
            notification_data['resultCode'] = 'Cancelled'
        else:
            return  # Don't handle unsupported event codes

        # Handle the notification data as a regular feedback
        request.env['payment.transaction'].sudo()._handle_feedback_data('odoo', notification_data)
