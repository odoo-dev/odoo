from odoo import http
from odoo.addons.pos_self.controllers.orders import PosSelfController


class PosSelfOrderController(PosSelfController):
    @http.route("/pos-self-order/process-order/<device_type>/", auth="public", type="jsonrpc", website=True)
    def self_order_process_order(self, order, access_token, table_identifier, device_type):
        return self.process_order(order, access_token, table_identifier, device_type)

    @http.route('/pos-self-order/validate-partner', auth='public', type='jsonrpc', website=True)
    def self_order_validate_partner(self, access_token, name, phone, street, zip, city, country_id, state_id=None, partner_id=None, email=None):
        return self.validate_partner(access_token, name, phone, street, zip, city, country_id, state_id, partner_id, email)

    @http.route('/pos-self-order/remove-order', auth='public', type='jsonrpc', website=True)
    def self_order_remove_order(self, access_token, order_id, order_access_token):
        self.remove_order(access_token, order_id, order_access_token)

    @http.route('/pos-self-order/get-user-data', auth='public', type='jsonrpc', website=True)
    def self_order_get_user_data(self, access_token, order_access_tokens, table_identifier=None):
        return self.get_orders_by_access_token(access_token, order_access_tokens, table_identifier)

    @http.route('/kiosk/payment/<int:pos_config_id>/<device_type>', auth='public', type='jsonrpc', website=True)
    def self_order_kiosk_payment(self, pos_config_id, order, payment_method_id, access_token, device_type):
        return self.pos_self_order_kiosk_payment(pos_config_id, order, payment_method_id, access_token, device_type)

    @http.route("/kiosk/payment_method_action/<action>", auth="public", type="jsonrpc", website=True)
    def self_order_kiosk_payment_method_action(self, access_token, action, args, kwargs):
        return self.pos_self_order_kiosk_payment_method_action(access_token, action, args, kwargs)

    @http.route('/pos_self_order/kiosk/increment_nb_print/', auth='public', type='jsonrpc', website=True)
    def self_order_increment_nb_print(self, access_token, order_id, order_access_token):
        return self.pos_kiosk_increment_nb_print(access_token, order_id, order_access_token)

    @http.route('/pos-self-order/change-printer-status', auth='public', type='jsonrpc', website=True)
    def self_order_change_printer_status(self, access_token, has_paper):
        return self.change_printer_status(access_token, has_paper)

    @http.route('/pos-self-order/get-slots', auth='public', type='jsonrpc', website=True)
    def self_order_get_slots(self, access_token, preset_id):
        return self.get_slots(access_token, preset_id)
