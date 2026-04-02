from odoo import http
from odoo.http import request

from odoo.addons.pos_self.controllers.self_entry import PosSelfEntry


class PosSelfCheckout(PosSelfEntry):
    @http.route(["/pos-self-checkout/<config_id>", "/pos-self-checkout/<config_id>/<path:subpath>"], auth="public", website=True, sitemap=True)
    def start_self_checkout(self, config_id=None, access_token=None, subpath=None, **kwargs):
        res = self._verify_entry_access(config_id, access_token, **kwargs)
        pos_config = res['pos_config']
        config_access_token = res['config_access_token']
        return request.render(
                'pos_self_checkout.index',
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
        if pos_config.self_ordering_mode != 'checkout':
            return res

        if pos_config.has_active_session:
            if config_access_token:
                res['config_access_token'] = pos_config.access_token

        return res
