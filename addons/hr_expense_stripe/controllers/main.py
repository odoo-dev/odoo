import logging

from odoo.exceptions import ValidationError
from odoo.http import (
    Controller,
    request,
    route,
)

_logger = logging.getLogger(__name__)

class StripeIssuingController(Controller):
    _webhook_url='/stripe_issuing/webhook'

    @route(_webhook_url, type='http', methods=['POST'], auth='public', csrf=False)
    def stripe_issuing_webhook(self):
        event = request.get_json_data()
        try:
            if event['type'] == 'issuing_authorization.created':
                request.env['hr.expense'].sudo()._create_expense_from_stripe_issuing_authorization(event['data']['object'])

        except ValidationError as e:
            _logger.exception("Error while processing the request: %s", e)

        return request.make_json_response('')
