# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http
from odoo.http import request

from odoo.addons.google_address_autocomplete.controllers.google_address_autocomplete import AutoCompleteController
from odoo.addons.pos_self_order.controllers import orders


class PosSelfOrderController(orders.PosSelfOrderController):

    @http.route('/pos-self/autocomplete/address', methods=['POST'], type='jsonrpc', auth='public', website=True)
    def pos_self_order_autocomplete_address(self, access_token, partial_address, **kwargs):
        self._verify_pos_config(access_token)
        google_places_api_key = request.env['pos.config']._get_google_places_api_key()
        if not google_places_api_key:
            return {'results': []}
        return AutoCompleteController()._perform_place_search(partial_address, api_key=google_places_api_key)

    @http.route('/pos-self/autocomplete/address_full', methods=['POST'], type='jsonrpc', auth='public', website=True)
    def pos_self_order_autocomplete_address_full(self, access_token, address, google_place_id=None, **kwargs):
        self._verify_pos_config(access_token)
        google_places_api_key = request.env['pos.config']._get_google_places_api_key()
        if not google_places_api_key:
            return {'address': None}
        return AutoCompleteController()._perform_complete_place_search(address, api_key=google_places_api_key, google_place_id=google_place_id)
