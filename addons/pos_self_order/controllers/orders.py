from werkzeug.exceptions import Forbidden, Unauthorized

from odoo import http
from odoo.fields import Domain
from odoo.http import request

from odoo.addons.pos_self.controllers.orders import PosSelfController


class PosSelfOrderController(PosSelfController):
    @http.route("/pos-self-order/process-order/<device_type>/", auth="public", type="jsonrpc", website=True)
    def self_order_process_order(self, order, access_token, table_identifier, device_type):
        return self.process_order(order, access_token, device_type, table_identifier=table_identifier)

    @http.route('/pos-self-order/validate-partner', auth='public', type='jsonrpc', website=True)
    def self_order_validate_partner(self, access_token, name, phone, street, zip, city, country_id, state_id=None, partner_id=None, email=None):
        return self.validate_partner(access_token, name, phone, street, zip, city, country_id, state_id, partner_id, email)

    @http.route('/pos-self-order/remove-order', auth='public', type='jsonrpc', website=True)
    def self_order_remove_order(self, access_token, order_id, order_access_token):
        self.remove_order(access_token, order_id, order_access_token)

    @http.route('/pos-self-order/get-user-data', auth='public', type='jsonrpc', website=True)
    def self_order_get_user_data(self, access_token, order_access_tokens, table_identifier=None):
        return self.get_orders_by_access_token(access_token, order_access_tokens, table_identifier=table_identifier)

    @http.route('/kiosk/payment/<int:pos_config_id>/<device_type>', auth='public', type='jsonrpc', website=True)
    def self_order_kiosk_payment(self, pos_config_id, order, payment_method_id, access_token, device_type):
        return self.pos_self_payment(pos_config_id, order, payment_method_id, access_token, device_type)

    @http.route("/kiosk/payment_method_action/<action>", auth="public", type="jsonrpc", website=True)
    def self_order_kiosk_payment_method_action(self, access_token, action, args, kwargs):
        return self.pos_self_payment_method_action(access_token, action, args, kwargs)

    @http.route('/pos_self_order/kiosk/increment_nb_print/', auth='public', type='jsonrpc', website=True)
    def self_order_increment_nb_print(self, access_token, order_id, order_access_token):
        return self.pos_self_increment_nb_print(access_token, order_id, order_access_token)

    @http.route('/pos-self-order/change-printer-status', auth='public', type='jsonrpc', website=True)
    def self_order_change_printer_status(self, access_token, has_paper):
        return self.change_printer_status(access_token, has_paper)

    @http.route('/pos-self-order/get-slots', auth='public', type='jsonrpc', website=True)
    def self_order_get_slots(self, access_token, preset_id):
        return self.get_slots(access_token, preset_id)

    def pos_self_payment_method_action(self, access_token, action, args, kwargs):
        pos_config = self._verify_pos_config(access_token)
        if pos_config.self_ordering_mode != "kiosk":
            raise Forbidden("Method only allowed in kiosk mode")
        return super().pos_self_payment_method_action(access_token, action, args, kwargs)

    def _verify_authorization(self, access_token, order, **kwargs):
        res = super()._verify_authorization(access_token, order, **kwargs)
        pos_config = res['pos.config']
        table_identifier = kwargs.get('table_identifier')
        table_sudo = request.env["restaurant.table"].sudo().search([('identifier', '=', table_identifier)], limit=1)
        preset = request.env['pos.preset'].sudo().browse(order.get('preset_id'))
        is_takeaway = order and pos_config.use_presets and preset and preset.service_at != 'table'
        if not table_sudo and not pos_config.self_ordering_mode == 'kiosk' and pos_config.self_ordering_service_mode == 'table' and not is_takeaway:
            raise Unauthorized("Table not found")

        company = pos_config.company_id
        user = pos_config.self_ordering_default_user_id
        table = table_sudo.sudo(False).with_company(company).with_user(user).with_context(allowed_company_ids=company.ids)
        res['table'] = table
        return res

    def _verify_config_constraint(self, pos_config_sudo, check_active_session=True):
        return super()._verify_config_constraint(pos_config_sudo, check_active_session) or (pos_config_sudo.self_ordering_mode != 'mobile' and pos_config_sudo.self_ordering_mode != 'kiosk')

    def _get_domain_access_token(self, pos_config, order_access_tokens, **kwargs):
        table_identifier = kwargs.get('table_identifier')
        table = pos_config.env["restaurant.table"].search([('identifier', '=', table_identifier)], limit=1)
        domain = super()._get_domain_access_token(pos_config, order_access_tokens, **kwargs)
        if table_identifier and pos_config.self_ordering_pay_after != 'each':
            domain = Domain.AND([domain, ['&', '&',
                ('table_id', '=', table.id),
                ('state', '=', 'draft'),
                ('access_token', 'not in', [data.get('access_token') for data in order_access_tokens])
            ]])
        return domain
