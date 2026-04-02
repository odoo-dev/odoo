from odoo import http
from odoo.addons.pos_self.controllers.orders import PosSelfController


class PosSelfCheckoutController(PosSelfController):
    @http.route("/pos-self-checkout/process-order/", auth="public", type="jsonrpc", website=True)
    def self_order_process_order(self, order, access_token):
        return self.process_order(order, access_token, "checkout")

    @http.route('/pos-self-checkout/help-request', auth='public', type='jsonrpc', website=True)
    def self_checkout_help_request(self, access_token, help_asked):
        pos_config = self._verify_pos_config(access_token)
        pos_config._notify("CHECKOUT_HELP_REQUEST", {
            "help_asked": help_asked,
        })

    @http.route('/pos-self-checkout/payment/<int:pos_config_id>/', auth='public', type='jsonrpc', website=True)
    def self_checkout_payment(self, pos_config_id, order, payment_method_id, access_token):
        return self.pos_self_payment(pos_config_id, order, payment_method_id, access_token, "checkout")
