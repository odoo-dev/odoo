import json
from odoo.tests.common import TransactionCase
from odoo.exceptions import AccessDenied
import requests

class TestAuthOAuth(TransactionCase):
    def test_auth_oauth_error(self):
        provider = self.env['auth.oauth.provider'].create({
            'name': 'Test Provider',
            'client_id': 'test',
            'auth_endpoint': 'https://test.com/auth',
            'scope': 'test',
            'validation_endpoint': 'https://invalid.domain.that.does.not.exist.com/validation',
            'data_endpoint': '',
            'body': 'Login with Test',
        })
        
        params = {
            'error': 'invalid_request',
            'error_description': 'Application is not configured...',
            'state': json.dumps({'d': self.env.cr.dbname, 'p': provider.id, 'r': 'https://mishwarah.odoo.com/web'}),
        }
        
        # If the code incorrectly tries to validate the token, it will raise ConnectionError because the domain is invalid
        with self.assertRaises(AccessDenied, msg="Expected AccessDenied, but probably raised something else or nothing"):
            self.env['res.users'].auth_oauth(provider.id, params)
