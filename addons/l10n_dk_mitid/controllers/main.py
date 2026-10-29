import base64
import jwt
import requests
from urllib.parse import quote_plus

from odoo import http

from odoo.addons.l10n_dk_mitid.models.res_config_settings import CODE_VERIFIER, JWKS_URL


def _verify_id_token(id_token, client_id):
    # Fetches the JWKS and picks the key matching the 'kid' of the JWT header
    signing_key = jwt.PyJWKClient(JWKS_URL).get_signing_key_from_jwt(id_token)
    # Checks the signature, 'exp', 'iat', 'iss' and 'aud' claims, raises jwt.InvalidTokenError otherwise
    return jwt.decode(
        id_token,
        key=signing_key.key,
        algorithms=['RS256'],
        audience=client_id,
        issuer='https://odoodev.test.idura.broker',
        options={'require': ['exp', 'iat', 'iss', 'aud', 'sub']},
    )


class MitIdController(http.Controller):
    @http.route('/api/l10n-dk-mitid/1/callback', type='http', auth='user')
    def callback(self, **kwargs):
        print("CALLBACK ----------------")
        print(kwargs)
        print("CALLBACK ----------------")
        base_url = 'https://odoodev.test.idura.broker/oauth2/token'
        client_id, client_secret = 'urn:my:application:identifier:609393', 'secret'
        params = {
            'grant_type': 'authorization_code',
            'code': kwargs.get('code'),
            'client_id': client_id,
            'redirect_uri': 'https://hot-wombat-patient.ngrok-free.app/api/l10n-dk-mitid/1/callback',
            'code_verifier': CODE_VERIFIER,
        }
        url = f"{base_url}?{params}"
        credentials = f"{quote_plus(client_id)}:{quote_plus(client_secret)}"
        headers = {
            "Authorization": "Basic " + base64.b64encode(credentials.encode()).decode(),
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        response = requests.post(url=url, headers=headers, params=params)
        print("RESPONSE ----------------")
        print(response.json())
        print("RESPONSE ----------------")
        claims = _verify_id_token(response.json()['id_token'], client_id)
        print("CLAIMS ----------------")
        print(claims)
        print("CLAIMS ----------------")
        return
