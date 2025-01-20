# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
import hashlib
import hmac
import json
import os
from datetime import datetime

from odoo import _, fields, models
from odoo.addons.l10n_ph_edi.tools.helpers import _decrypt_aes256, _encrypt_rsa, _request_eis
from odoo.exceptions import UserError
from odoo.tools import format_datetime

DEFAULT_EIS_PUBLIC_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgMbSxoPRLi4P98qbfdFvwYCEf6l2QcKHhyE+m7Fh8OSqKqQFWud0+SSqydzYZzQYZIQ0hwZ/Vvd6StsEY80O7XC6ELVZ052s91PjAlh38TSzmJGy8ZZUYLsg8S2DzKaCpQ0ZmvphYf0ZB8ZoOXBTVPpg4cGBVbMZLdTtnXYxSegXhog6XBsIkAXmAWHwzJ0t6x0NbMnsfbHvFlqtUrsbwBc4BD+0rO3lJHPbDO4HEiMmrlM/bD/hL4uKzXv3jeXCkDbQdYsZZgI7tglu2Al/jB8VdMDJRJjsQf0Z5Ye3FdOsqp1v3SF3ENns8F/0A8xrrB/SuKcwO7Rvm2fjogoqqwIDAQAB"


class ResCompany(models.Model):
    _inherit = 'res.company'

    # ------------------
    # Fields declaration
    # ------------------

    # Credentials & settings
    l10n_ph_edi_accreditation_id = fields.Char(
        string='EIS Accreditation ID',
    )
    l10n_ph_edi_application_id = fields.Char(
        string='EIS Application ID',
    )
    l10n_ph_edi_application_key = fields.Char(
        string='EIS Application Key',
    )
    l10n_ph_edi_user_id = fields.Char(
        string='EIS User ID',
    )
    l10n_ph_edi_user_password = fields.Char(
        string='EIS User Password',
    )
    l10n_ph_edi_eis_public_key = fields.Char(
        string='EIS Public Key',
        default=DEFAULT_EIS_PUBLIC_KEY,
    )
    l10n_ph_edi_eis_jws_key = fields.Char(
        string='EIS JWS Key',
    )
    l10n_ph_edi_eis_jws_private_key = fields.Char(
        string='EIS JWS Private Key',
    )
    l10n_ph_edi_in_use = fields.Boolean()
    # Auth information generated/fetched
    l10n_ph_edi_auth_token = fields.Char(readonly=True, copy=False)
    l10n_ph_edi_auth_session_key = fields.Char(readonly=True, copy=False)
    l10n_ph_edi_auth_token_expiry = fields.Datetime(readonly=True, copy=False)

    # ----------------
    # Business methods
    # ----------------

    def _l10n_ph_edi_enable(self):
        """ Enabling the integration does two things, validating the credentials and marking the EDI as ready for use. """
        self.ensure_one()
        self._l10n_ph_edi_authenticate(force_refresh=True)  # We want a new token.
        self.l10n_ph_edi_in_use = True

    def _l10n_ph_edi_authenticate(self, force_refresh=False):
        """ Send a request to the EIS in order to authenticate the user and retrieve the information required for invoicing. """
        self.ensure_one()
        if not self.l10n_ph_edi_accreditation_id or not self.l10n_ph_edi_application_id or not self.l10n_ph_edi_user_id or not self.l10n_ph_edi_application_key or not self.l10n_ph_edi_user_password:
            raise UserError(_('You must fill the EIS credentials in the settings before using the EIS integration.'))

        now = format_datetime(self.env, fields.Datetime.now(), dt_format='yyyyMMddHHmmss')
        h = hmac.new(base64.b64decode(self.l10n_ph_edi_application_key), f'{now}POST/api/authentication'.encode(), digestmod=hashlib.sha256)

        encryption_key = base64.b64encode(os.urandom(32)).decode('utf-8')[:32]

        # Prepare the data then encrypt them
        data = {
            'userId': self.l10n_ph_edi_user_id,
            'password': self.l10n_ph_edi_user_password,
            'authKey': encryption_key,
        }

        response, error_message = _request_eis(
            env=self.env,
            method='POST',
            endpoint='/api/authentication',
            headers={
                'accreditationId': self.l10n_ph_edi_accreditation_id,
                'applicationId': self.l10n_ph_edi_application_id,
                'authorization': f"Bearer {h.hexdigest()}",
                'datetime': now,
            },
            json_data={
                'data': base64.b64encode(_encrypt_rsa(json.dumps(data).encode(), self.l10n_ph_edi_eis_public_key)).decode(),
                'forceRefreshToken': force_refresh,
            },
        )

        if error_message:
            raise UserError(error_message)

        # If we did not receive an error, we decrypt the data to get the required information.
        decrypted_data = json.loads(_decrypt_aes256(base64.b64decode(response['data']), encryption_key))

        # Save what is needed, and finally return the authKey.
        self.write({
            'l10n_ph_edi_auth_token': decrypted_data['authToken'],
            'l10n_ph_edi_auth_session_key': decrypted_data['sessionKey'],
            'l10n_ph_edi_auth_token_expiry': datetime.strptime(decrypted_data['tokenExpiry'], '%Y-%m-%dT%H:%M:%S'),
        })

        return self.l10n_ph_edi_auth_token

    def _l10n_ph_edi_get_auth_token(self):
        """ Helper to return the auth token if it is not expired, otherwise fetch a new one and return it. """
        if fields.Datetime.now() > self.l10n_ph_edi_auth_token_expiry:
            self._l10n_ph_edi_authenticate(force_refresh=True)  # Force refresh just in case, to ensure we update the token.
        return self.l10n_ph_edi_auth_token
