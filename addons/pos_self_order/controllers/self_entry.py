from odoo import http
from odoo.http import request
from odoo.addons.pos_self.controllers.self_entry import PosSelfEntry


class PosSelfKiosk(PosSelfEntry):
    @http.route(["/pos-self/<config_id>", "/pos-self/<config_id>/<path:subpath>"], auth="public", website=True, sitemap=True)
    def start_self_ordering(self, config_id=None, access_token=None, table_identifier=None, subpath=None):
        pos_config, _, config_access_token = self._verify_entry_access(config_id, access_token, table_identifier)
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
                    }
                }
            )

    @http.route("/pos-self/data/<config_id>", type='jsonrpc', auth='public', website=True)
    def get_self_ordering_data(self, config_id=None, access_token=None, table_identifier=None):
        return self.get_self_data(config_id, access_token, table_identifier)

    @http.route("/pos-self/receipt-template/<config_id>", type='jsonrpc', auth='public')
    def get_self_ordering_receipt_template(self, config_id=None, access_token=None, table_identifier=None):
        return self.get_self_receipt_template(config_id, access_token, table_identifier)

    @http.route("/pos-self/relations/<config_id>", type='jsonrpc', auth='public')
    def get_self_ordering_relations(self, config_id=None, access_token=None, table_identifier=None):
        return self.get_self_relations(config_id, access_token, table_identifier)
