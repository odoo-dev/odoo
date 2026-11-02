# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import binascii
import re
from urllib.parse import urlsplit

import requests

from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError

from odoo.addons.iap.tools import iap_tools


class IapAccount(models.Model):
    _inherit = 'iap.account'

    @api.model
    def _l10n_jp_request_timestamp(self, digest, nonce, *, account_token=None, policy_oid=None, mode='test'):
        """Submit one immutable signing intent; replay uses the same nonce."""
        if not isinstance(digest, str) or not re.fullmatch(r'[0-9a-fA-F]{64}', digest):
            raise ValidationError(self.env._('Provide a SHA-256 hexadecimal digest.'))
        params = {'digest': digest, 'nonce': nonce, 'mode': mode}
        if policy_oid:
            params['policy_oid'] = policy_oid
        return self._l10n_jp_timestamp_rpc('request', params, account_token=account_token)

    @api.model
    def _l10n_jp_timestamp_status(self, nonce, *, account_token, mode='test'):
        return self._l10n_jp_timestamp_rpc('status', {'nonce': nonce, 'mode': mode}, account_token=account_token)

    @api.model
    def _l10n_jp_timestamp_rpc(self, route, params, *, account_token=None):
        if not self.env.user.has_group('account.group_account_manager'):
            raise AccessError(self.env._('Only Accounting administrators can request document timestamps.'))
        nonce = params.get('nonce')
        if (route not in ('request', 'status')
                or params.get('mode') not in ('test', 'production')
                or not isinstance(nonce, str) or not re.fullmatch(r'[0-9a-fA-F]{32}', nonce)
                or not int(nonce, 16)):
            raise ValidationError(self.env._('Provide a SHA-256 hexadecimal digest and a nonzero 128-bit hexadecimal nonce.'))

        # Read only the fixed service settings and database identity as administrator.
        parameters = self.env['ir.config_parameter'].sudo()
        endpoint = (parameters.get_str('l10n_jp_account_timestamp.iap_endpoint') or iap_tools.iap_get_endpoint(self.env)).rstrip('/')
        endpoint_error = self.env._('Configure the Japan timestamp IAP server URL. Use HTTPS, or HTTP on localhost for testing.')
        try:
            url = urlsplit(endpoint)
            port = url.port
        except ValueError:
            raise UserError(endpoint_error) from None
        valid_scheme = url.scheme == 'https' or (
            url.scheme == 'http' and url.hostname in (
                'localhost',
                '127.0.0.1',
                '::1',
            )
        )
        if (not valid_scheme or not url.hostname or port == 0
                or url.username or url.password or url.path or url.query or url.fragment):
            raise UserError(endpoint_error)
        db_uuid = parameters.get_str('database.uuid')
        if not db_uuid:
            raise UserError(self.env._('The database identifier is missing.'))

        # Scope account selection to the current allowed companies before reading its secret.
        if not account_token:
            account_token = self.get('l10n_jp_timestamp_proxy').sudo().account_token
        try:
            response = iap_tools.iap_jsonrpc(
                endpoint + '/api/l10n_jp_timestamp/1/' + route,
                params={
                    'db_uuid': db_uuid,
                    'account_token': account_token,
                    **params,
                },
                # Allow credit authorization and durable acceptance; issuance is queued.
                timeout=90,
            )
        except requests.RequestException:
            # The provider or IAP may already have processed the call. Never resend here.
            return {'error': 'iap_outcome_unknown', 'retryable': False}
        except (
            KeyError,
            TypeError,
            ValueError,
        ):
            return {'error': 'invalid_iap_response', 'retryable': False}

        if not isinstance(response, dict):
            return {'error': 'invalid_iap_response', 'retryable': False}
        if response.get('error') and isinstance(response['error'], str) and 'token' not in response:
            # Native subscription/rate-rule errors do not all include retry metadata.
            return {
                'status': 'reconcile' if response.get('status') == 'reconcile' else 'error',
                'error': response['error'],
                'retryable': False,
            }
        if response.get('status') in ('pending', 'not_found') and 'token' not in response:
            return {'status': response['status'], 'poll_after': 60}
        token = response.get('token')
        if response.get('error') or not isinstance(token, str):
            return {'error': 'invalid_iap_response', 'retryable': False}
        try:
            decoded_token = base64.b64decode(token, validate=True)
        except (binascii.Error, ValueError):
            return {'error': 'invalid_iap_response', 'retryable': False}
        if not decoded_token:
            return {'error': 'invalid_iap_response', 'retryable': False}
        return {'status': 'done', 'token': token}
