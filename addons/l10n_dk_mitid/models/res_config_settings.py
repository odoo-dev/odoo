import base64
import hashlib
from urllib.parse import urlencode

from odoo import api, models

# TODO: fixed PKCE verifier for testing only, generate one per flow (e.g. secrets.token_urlsafe(64))
CODE_VERIFIER = 'odoo-mitid-test-code-verifier-0123456789abcdefghijklmnop'
CODE_CHALLENGE = base64.urlsafe_b64encode(hashlib.sha256(CODE_VERIFIER.encode()).digest()).rstrip(b'=').decode()
# Use kid in the JWT header to get the JWK
JWKS_URL = 'https://odoodev.test.idura.broker/.well-known/jwks'


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    @api.model
    def action_start_authenticate(self, args):
        print(args)
        base_url = 'https://odoodev.test.idura.broker/oauth2/authorize'
        params = urlencode({
            'response_type': 'code',
            'response_mode': 'query',
            'client_id': 'urn:my:application:identifier:609393',
            'redirect_uri': 'https://hot-wombat-patient.ngrok-free.app/api/l10n-dk-mitid/1/callback',
            'acr_values': 'urn:grn:authn:dk:mitid:substantial',
            'scope': 'openid',
            'state': 'testodoo123',
            'code_challenge': CODE_CHALLENGE,
            'code_challenge_method': 'S256',
        })
        url = f"{base_url}?{params}"
        return {
            'type': 'ir.actions.act_url',
            'url': url,
            'target': 'self',
        }
