import base64
import requests

from datetime import datetime
from dateutil.relativedelta import relativedelta
from werkzeug.urls import url_join

from odoo import fields, models, api, _
from odoo.exceptions import UserError
from odoo.tools import json


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_ro_edi_client_id = fields.Char(string='Client ID')
    l10n_ro_edi_client_secret = fields.Char(string='Client Secret')
    l10n_ro_edi_access_token = fields.Char(string='Access Token')
    l10n_ro_edi_refresh_token = fields.Char(string='Refresh Token')
    l10n_ro_edi_access_expiry_date = fields.Date(string='Access Token Expiry Date')
    l10n_ro_edi_refresh_expiry_date = fields.Date(string='Refresh Token Expiry Date')
    l10n_ro_edi_callback_url = fields.Char(compute='_compute_l10n_ro_edi_callback_url')
    l10n_ro_edi_test_env = fields.Boolean(string='Use Test Environment', default=True)
    l10n_ro_edi_oauth_error = fields.Char()

    @api.depends('country_code')
    def _compute_l10n_ro_edi_callback_url(self):
        for company in self:
            if company.country_code == 'RO':
                company.l10n_ro_edi_callback_url = url_join(self.get_base_url(), 'l10n_ro_edi/callback/%s' % company.id)
            else:
                company.l10n_ro_edi_callback_url = False

    def _l10n_ro_edi_get_errors_pre_request(self):
        self.ensure_one()
        errors = []
        if not self.l10n_ro_edi_access_token:
            errors.append(_('Romanian access token not found. Please generate or fill it in the settings.'))
        return errors

    def _l10n_ro_edi_process_token_response(self, response_json):
        self.ensure_one()
        if 'access_token' not in response_json or 'refresh_token' not in response_json:
            error_message = _("Token not found.\nResponse: %s", response_json)
            self.l10n_ro_edi_oauth_error = error_message
            self.env.cr.commit()
            raise UserError(error_message)

        # The access_token is in JWT format, which consists of 3 parts separated by '.':
        # Header, Payload, and Signature. We only need the Payload part to decode the token
        # and get the access expiry date
        payload = response_json['access_token'].split('.')[1]
        payload += '=' * (-len(payload) % 4)
        decoded_payload = base64.urlsafe_b64decode(payload).decode('utf-8')
        access_token_obj = json.loads(decoded_payload)
        access_expiry_date = datetime.fromtimestamp(access_token_obj['exp'])
        refresh_expiry_date = datetime.now() + relativedelta(years=3)
        self.write({
            'l10n_ro_edi_access_token': response_json['access_token'],
            'l10n_ro_edi_refresh_token': response_json['refresh_token'],
            'l10n_ro_edi_access_expiry_date': access_expiry_date,
            'l10n_ro_edi_refresh_expiry_date': refresh_expiry_date,
            'l10n_ro_edi_oauth_error': False,
        })

    def _l10n_ro_edi_refresh_access_token(self, session):
        self.ensure_one()
        if not self.l10n_ro_edi_client_id or not self.l10n_ro_edi_client_secret:
            raise UserError(_("Client ID and Client Secret field must be filled."))
        if not self.l10n_ro_edi_refresh_token:
            raise UserError(_("Refresh token not found"))

        response = session.post(
            url='https://logincert.anaf.ro/anaf-oauth2/v1/token',
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            timeout=10,
            data={
                'grant_type': 'refresh_token',
                'refresh_token': self.l10n_ro_edi_refresh_token,
                'client_id': self.l10n_ro_edi_client_id,
                'client_secret': self.l10n_ro_edi_client_secret,
            },
        )
        response_json = response.json()
        self._l10n_ro_edi_process_token_response(response_json)

    def _cron_l10n_ro_edi_refresh_access_token(self):
        ro_companies = self.env['res.company'].sudo().search([
            ('l10n_ro_edi_refresh_token', '!=', False),
            ('l10n_ro_edi_client_id', '!=', False),
            ('l10n_ro_edi_client_secret', '!=', False),
        ])
        session = requests.session()
        for company in ro_companies:
            company._l10n_ro_edi_refresh_access_token(session)
