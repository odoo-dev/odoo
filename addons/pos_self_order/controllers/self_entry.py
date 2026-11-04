# -*- coding: utf-8 -*-
import werkzeug

from odoo import http
from odoo.http import request
from odoo.tools import consteq


class PosSelfKiosk(http.Controller):
    @http.route("/pos-self/session/create", type='jsonrpc', auth='public', website=True)
    def create_table_session(self, config_id=None, table_identifier=None, access_token=None):
        """Generate a stateless HMAC-signed table session token on QR scan."""
        if not config_id or not str(config_id).isnumeric() or not table_identifier:
            return {'status': 'error', 'message': 'Missing parameters'}

        pos_config = request.env["pos.config"].sudo().browse(int(config_id))
        if not pos_config.exists() or not pos_config._is_secure_table_session_enabled():
            return {'status': 'disabled'}

        if not access_token or not isinstance(access_token, str) or not pos_config.access_token or not consteq(pos_config.access_token, access_token):
            return {'status': 'error', 'message': 'Invalid access token'}

        table = request.env["restaurant.table"].sudo().search(
            [("identifier", "=", table_identifier), ("active", "=", True)], limit=1
        )
        if not table:
            return {'status': 'error', 'message': 'Table not found'}
        while table.parent_id:
            table = table.parent_id

        if pos_config.floor_ids and table.floor_id not in pos_config.floor_ids:
            return {'status': 'error', 'message': 'Table does not belong to this POS'}

        token, expires_at = pos_config._generate_table_session_token(table.identifier)
        return {
            'status': 'open',
            'token': token,
            'timeout_minutes': pos_config.self_order_session_timeout_minutes,
            'expires_at_ms': expires_at * 1000,
        }

    @http.route(["/pos-self/<config_id>", "/pos-self/<config_id>/<path:subpath>"], auth="public", website=True, sitemap=True)
    def start_self_ordering(self, config_id=None, access_token=None, table_identifier=None, order_identifier=None, subpath=None, **kwargs):
        pos_config, _, config_access_token = self._verify_entry_access(config_id, access_token, table_identifier)

        if (default_lang := pos_config.self_ordering_default_language_id) and not request.cookies.get('frontend_lang'):
            request.future_response.set_cookie('frontend_lang', default_lang.code)

        return request.render(
                'pos_self_order.index',
                {
                    'access_token': config_access_token,
                    'session_info': {
                        **request.env["ir.http"].get_frontend_session_info(),
                        'bus_info': request.env["ir.http"]._get_bus_session_info(),
                        'currencies': request.env["res.currency"].get_all_currencies(),
                        'data': {
                            'config_id': pos_config.id,
                            'self_ordering_mode': pos_config.self_ordering_mode,
                        },
                        "base_url": request.env['pos.session'].get_base_url(),
                        "db": request.env.cr.dbname,
                    },
                    'pos_config_id': pos_config.id,
                    'pos_session_id': pos_config.current_session_id.id if pos_config.has_active_session else 0,  # Use 0 when there's no active session; False becomes empty when rendered via t-out
                },
            )

    @http.route("/pos-self/data/<config_id>", type='jsonrpc', auth='public', website=True)
    def get_self_ordering_data(self, config_id=None, access_token=None, table_identifier=None):
        pos_config, _, config_access_token = self._verify_entry_access(config_id, access_token, table_identifier)
        data = pos_config.load_self_data()
        data['pos.config']['records'][0]['access_token'] = config_access_token
        return data

    def _verify_entry_access(self, config_id=None, access_token=None, table_identifier=None):
        table_sudo = False

        if not config_id or not config_id.isnumeric():
            raise werkzeug.exceptions.NotFound()

        if access_token:
            config_access_token = True
            pos_config_sudo = request.env["pos.config"].sudo().search([
                ("id", "=", config_id), ('access_token', '=', access_token)], limit=1)
        else:
            config_access_token = False
            pos_config_sudo = request.env["pos.config"].sudo().search([
                ("id", "=", config_id)], limit=1)

        if not pos_config_sudo or pos_config_sudo.self_ordering_mode == 'nothing':
            raise werkzeug.exceptions.NotFound()

        company = pos_config_sudo.company_id
        user = pos_config_sudo.self_ordering_default_user_id
        pos_config = pos_config_sudo.sudo(False).with_company(company).with_user(user).with_context(allowed_company_ids=company.ids, lang=request.cookies.get('frontend_lang'))

        if not pos_config:
            raise werkzeug.exceptions.NotFound()

        if pos_config and pos_config.self_ordering_mode == 'mobile':
            table_sudo = table_identifier and (
                request.env["restaurant.table"]
                .sudo()
                .search([("identifier", "=", table_identifier), ("active", "=", True)], limit=1)
            )
            if table_sudo and table_sudo.parent_id:
                table_sudo = table_sudo.parent_id
        # In mobile mode, always set config_access_token (needed for notification), even without an active session
        if config_access_token and pos_config.self_ordering_mode in ['kiosk', 'mobile']:
            config_access_token = pos_config.access_token
        else:
            config_access_token = ''

        table = table_sudo.sudo(False).with_company(company).with_user(user) if table_sudo else False
        return pos_config, table, config_access_token
