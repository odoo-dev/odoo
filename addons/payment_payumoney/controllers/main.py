# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

import werkzeug

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class PayUMoneyController(http.Controller):
    _return_url = '/payment/payumoney/return'

    @http.route(_return_url, type='http', auth='public', methods=['GET', 'POST'], csrf=False)
    def payumoney_return(self, **data):
        _logger.info(f"entering handle_feedback_data with data:\n{pprint.pformat(data)}")
        request.env['payment.transaction'].sudo()._handle_feedback_data('payumoney', data)
        return werkzeug.utils.redirect('/payment/status')
