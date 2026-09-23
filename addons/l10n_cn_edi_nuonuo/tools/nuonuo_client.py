# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
import uuid

import requests

from odoo.exceptions import UserError

from odoo.addons.l10n_cn_edi.tools import L10nCnEdiClient

_logger = logging.getLogger(__name__)

# 诺税通 has no sandbox: 联调 happens on production with a vendor-issued test account.
ENDPOINT = 'https://sdk.nuonuo.com/open/v1/services'
TIMEOUT = 30
SUCCESS = 'E0000'
INVOICE_NOT_FOUND = 'E9500'
# Gateway codes meaning the app's credentials are wrong, not the request.
CREDENTIAL_ERRORS = {
    '070101',  # 获取app密钥失败或appkey无效
    '070304',  # bad credentials
    '070305',  # bad credentials
    '070306',  # token call limit reached
    '070307',  # wrong app type
}


def sign(app_secret, app_key, senid, nonce, timestamp, content):
    """X-Nuonuo-Sign: base64(HMAC-SHA1) over the canonical string of the request.

    The fixed path /open/v1/services reads a=services&l=v1&p=open, and f is the exact
    request body, so the body must be sent byte for byte as it was signed.
    """
    message = f'a=services&l=v1&p=open&k={app_key}&i={senid}&n={nonce}&t={timestamp}&f={content}'
    digest = hmac.new(app_secret.encode(), message.encode(), hashlib.sha1).digest()
    return base64.b64encode(digest).decode()


class NuonuoClient(L10nCnEdiClient):

    def __init__(self, company):
        super().__init__(company)
        # Secrets are admin-only fields, but any accountant may issue a fapiao.
        company_sudo = company.sudo()
        self.app_key = company_sudo.l10n_cn_edi_nuonuo_app_key or ''
        self.app_secret = company_sudo.l10n_cn_edi_nuonuo_app_secret or ''
        self.token = company_sudo.l10n_cn_edi_nuonuo_token or ''
        self.tax_no = company_sudo.vat or ''

    # ------------------------------------------------------------------
    # Transport
    # ------------------------------------------------------------------

    def _call(self, method, payload):
        """Send one signed request and return the decoded ``{code, describe, result}`` body.

        Transport and credential problems raise a UserError; business codes are the
        caller's to interpret.
        """
        env = self.company.env
        content = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
        senid = uuid.uuid4().hex
        nonce = str(10_000_000 + secrets.randbelow(90_000_000))
        timestamp = str(int(time.time()))
        try:
            response = requests.post(
                ENDPOINT,
                params={'senid': senid, 'nonce': nonce, 'timestamp': timestamp, 'appkey': self.app_key},
                data=content.encode(),
                headers={
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Nuonuo-Sign': sign(self.app_secret, self.app_key, senid, nonce, timestamp, content),
                    'accessToken': self.token,
                    'userTax': self.tax_no,
                    'method': method,
                },
                timeout=TIMEOUT,
            )
            response.raise_for_status()
            body = response.json()
        except (requests.RequestException, ValueError) as e:
            _logger.warning("Nuonuo %s failed for company %s: %s", method, self.company.vat, e)
            raise UserError(env._("Could not reach Nuonuo. Please try again later.")) from e
        code = str(body.get('code') or '')
        if code in CREDENTIAL_ERRORS:
            raise UserError(env._(
                "Nuonuo rejected the app credentials of %(company)s (%(code)s: %(message)s). "
                "Please check the App Key, App Secret and Access Token in the settings.",
                company=self.company.name,
                code=code,
                message=body.get('describe') or '',
            ))
        return body

    # ------------------------------------------------------------------
    # Contract
    # ------------------------------------------------------------------

    def ensure_ready(self):
        if not self.company._l10n_cn_edi_is_ready():
            raise UserError(self.company.env._(
                "Nuonuo is not set up for %s: its Tax ID, App Key, App Secret and Access Token are required.",
                self.company.name,
            ))

    def test_connection(self):
        """Ask for an invoice that can't exist: 'not found' proves the signature, token and app are right."""
        self.ensure_ready()
        body = self._call('nuonuo.OpeMplatform.queryInvoiceResult', {
            'orderNos': [f'ODOO-CONNECTION-TEST-{uuid.uuid4().hex[:12]}'],
            'isOfferInvoiceDetail': '0',
        })
        if body.get('code') not in (SUCCESS, INVOICE_NOT_FOUND):
            raise UserError(self.company.env._(
                "Nuonuo answered %(code)s: %(message)s",
                code=body.get('code'),
                message=body.get('describe') or '',
            ))
