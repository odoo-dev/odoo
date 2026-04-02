import werkzeug

from odoo import http
from odoo.http import request


class PosSelfEntry(http.Controller):
    @http.route("/pos-self/data/<config_id>", type='jsonrpc', auth='public', website=True)
    def get_self_data(self, config_id=None, access_token=None, table_identifier=None):
        res = self._verify_entry_access(config_id, access_token, table_identifier=table_identifier)
        pos_config = res['pos_config']
        config_access_token = res['config_access_token']
        data = pos_config.load_self_data()
        data['pos.config'][0]['access_token'] = config_access_token
        return data

    @http.route("/pos-self/receipt-template/<config_id>", type='jsonrpc', auth='public')
    def get_self_receipt_template(self, config_id=None, access_token=None, **kwargs):
        res = self._verify_entry_access(config_id, access_token, **kwargs)
        pos_config = res['pos_config']
        return pos_config.env['pos.order'].get_receipt_template_for_pos_frontend()

    @http.route("/pos-self/relations/<config_id>", type='jsonrpc', auth='public')
    def get_self_relations(self, config_id=None, access_token=None, **kwargs):
        res = self._verify_entry_access(config_id, access_token, **kwargs)
        pos_config = res['pos_config']
        return pos_config.load_data_params()

    def _verify_entry_access(self, config_id=None, access_token=None, **kwargs):
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
        return {
            'pos_config': pos_config,
            'config_access_token': config_access_token,
        }
