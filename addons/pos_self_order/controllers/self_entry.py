from odoo import http
from odoo.http import request
from odoo.addons.pos_self.controllers.self_entry import PosSelfEntry


class PosSelfKiosk(PosSelfEntry):
    @http.route(["/pos-self-order/<config_id>", "/pos-self-order/<config_id>/<path:subpath>"], auth="public", website=True, sitemap=True)
    def start_self_ordering(self, config_id=None, access_token=None, subpath=None, **kwargs):
        res = self._verify_entry_access(config_id, access_token, **kwargs)
        pos_config = res['pos_config']
        config_access_token = res['config_access_token']

        return request.render(
                'pos_self_order.index',
                {
                    'access_token': config_access_token,
                    'session_info': {
                        **request.env["ir.http"].get_frontend_session_info(),
                        'currencies': request.env["res.currency"].get_all_currencies(),
                        'data': {
                            'config_id': pos_config.id,
                            'self_ordering_mode': pos_config.self_ordering_mode,
                        },
                        "base_url": request.env['pos.session'].get_base_url(),
                        "db": request.env.cr.dbname,
                    },
                },
            )

    def _verify_entry_access(self, config_id=None, access_token=None, **kwargs):
        res = super()._verify_entry_access(config_id, access_token, **kwargs)
        pos_config = res['pos_config']
        config_access_token = res['config_access_token']
        if pos_config.self_ordering_mode not in ['kiosk', 'mobile', 'consultation']:
            return res

        table_identifier = kwargs.get('table_identifier')
        table_sudo = False
        company = pos_config.company_id
        user = pos_config.self_ordering_default_user_id
        if pos_config and pos_config.has_active_session and pos_config.self_ordering_mode == 'mobile':
            if config_access_token:
                res['config_access_token'] = pos_config.access_token
            table_sudo = table_identifier and (
                request.env["restaurant.table"]
                .sudo()
                .search([("identifier", "=", table_identifier), ("active", "=", True)], limit=1)
            )
            if table_sudo and table_sudo.parent_id:
                table_sudo = table_sudo.parent_id
        elif pos_config.self_ordering_mode == 'kiosk':
            if config_access_token:
                res['config_access_token'] = pos_config.access_token
        else:
            res['config_access_token'] = ''

        table = table_sudo.sudo(False).with_company(company).with_user(user) if table_sudo else False
        res['table'] = table
        return res
