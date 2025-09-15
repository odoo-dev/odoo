# Part of Odoo. See LICENSE file for full copyright and licensing details.
import json
import logging


from odoo import _
from odoo import http
from odoo.http import request
from odoo.exceptions import UserError, ValidationError

_logger = logging.getLogger(__name__)


class WooAuthController(http.Controller):
    @http.route('/woocommerce/callback', auth='public', methods=['POST'], csrf=False)
    def woocommerce_callback(self, **post):
        _logger.info('Authenticate Woocommerce redirect request with data: %s', post)
        raw_data = request.httprequest.get_data()
        data = json.loads(raw_data)
        user_id = data.get("user_id")
        user_id, account_id = user_id.split(":")
        account = request.env['marketplace.account'].sudo().browse(int(account_id))
        if not data.get('consumer_key') or not data.get('consumer_secret'):
            raise UserError(_("WooCommerce callback is missing Consumer Secret. Please use self_access method for authentication."))
        account.wc_consumer_key = data.get('consumer_key')
        account.wc_consumer_secret = data.get('consumer_secret')
        account.state = 'connected'
        return
