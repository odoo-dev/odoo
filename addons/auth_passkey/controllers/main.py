from odoo import http
from odoo.http import request
from odoo.addons.web.controllers.home import CREDENTIAL_PARAMS


CREDENTIAL_PARAMS.append('webauthn_response')


class WebauthnController(http.Controller):
    @http.route(['/auth/passkey/start-auth'], type='json', auth='public')
    def json_start_authentication(self, user_verification=True):
        auth_options = request.env['auth.passkey.key']._start_auth(user_verification)
        return auth_options
