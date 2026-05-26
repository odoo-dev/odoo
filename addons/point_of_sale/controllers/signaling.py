from odoo import http
from odoo.http import request


class PosWebrtcSignaling(http.Controller):

    @http.route('/pos_webrtc_signaling', auth='public', type='jsonrpc')
    def pos_webrtc_signaling(self, pos_config_id, payload, identifier=''):
        pos_config_sudo = request.env['pos.config'].sudo().browse(int(pos_config_id))
        if pos_config_sudo.exists():
            pos_config_sudo._notify(f'POS_WEBRTC_SIGNALING-{identifier}', payload)
