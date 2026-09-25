# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
import uuid
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import requests

from odoo.exceptions import UserError

from odoo.addons.l10n_cn_edi.tools import L10nCnEdiClient

_logger = logging.getLogger(__name__)

# 诺税通 has no sandbox: 联调 happens on production with a vendor-issued test account.
ENDPOINT = 'https://sdk.nuonuo.com/open/v1/services'
TIMEOUT = 30
SUCCESS = 'E0000'
INVOICE_NOT_FOUND = 'E9500'
DUPLICATE_ORDER = 'E9106'  # 订单编号或流水号不能重复: already submitted, so fetch it instead
RETRY_LIMIT = 'E9613'  # 同一流水号(订单号)单日最多重试 20 次
INVOICE_LINES = {'01': 'bs', '02': 'pc'}  # 数电电子专票 / 数电电子普票
STATUS_ISSUED = '2'  # 开票完成
STATUS_PENDING = {'20', '21'}  # 开票中, 开票成功签章中
STATUS_FAILED = '22'  # 开票失败
STATUS_SEAL_FAILED = '24'  # 签章失败: retried with reInvoice
STATUS_VOID = {'3', '31'}  # 已作废, 作废中
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

    # After submitting, their guide polls after 3-5 s; anything slower is left to the cron.
    result_delays = (3, 5)

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

    # ------------------------------------------------------------------
    # Blue fapiao
    # ------------------------------------------------------------------

    def issue_invoice(self, values):
        env = self.company.env
        body = self._call('nuonuo.OpeMplatform.requestBillingNew', {'order': self._prepare_order(values)})
        code = body.get('code')
        if code == DUPLICATE_ORDER:
            return self._query(values['serial_no'], missing_is_failure=False)
        if code != SUCCESS:
            return {
                'state': 'failed',
                'error': env._("Nuonuo refused the fapiao (%(code)s): %(message)s", code=code, message=body.get('describe') or ''),
                'new_serial': True,
            }
        return {'state': 'sent'}

    def query_invoice(self, move, just_submitted=False):
        return self._query(move.l10n_cn_edi_serial_no, missing_is_failure=not just_submitted)

    def _query(self, order_no, missing_is_failure):
        env = self.company.env
        body = self._call('nuonuo.OpeMplatform.queryInvoiceResult', {'orderNos': [order_no], 'isOfferInvoiceDetail': '0'})
        code = body.get('code')
        if code == INVOICE_NOT_FOUND:
            # Right after submitting, Nuonuo may not know the order yet.
            if not missing_is_failure:
                return {'state': 'sent'}
            return {'state': 'failed', 'error': env._("Nuonuo has no fapiao for order %s. Please send it again.", order_no)}
        if code != SUCCESS:
            raise UserError(env._("Nuonuo could not report on order %(order)s (%(code)s): %(message)s", order=order_no, code=code, message=body.get('describe') or ''))
        result = body.get('result') or [{}]
        invoice = result[0] if isinstance(result, list) else result
        status = str(invoice.get('status') or '')
        if status == STATUS_ISSUED:
            return self._issued_result(invoice)
        if status == STATUS_SEAL_FAILED:
            return self._retry_seal(invoice, order_no)
        if status == STATUS_FAILED:
            error = invoice.get('failCause') or invoice.get('statusMsg') or env._("Nuonuo failed to issue the fapiao.")
            return {'state': 'failed', 'error': error, 'new_serial': True}
        if status in STATUS_VOID:
            return {'state': 'failed', 'error': env._("The fapiao of order %s was voided on Nuonuo.", order_no), 'new_serial': True}
        return {'state': 'sent'}

    def _issued_result(self, invoice):
        fapiao_no = invoice.get('allElectronicInvoiceNumber') or invoice.get('invoiceNo')
        invoice_time = invoice.get('invoiceTime')
        result = {
            'state': 'issued',
            'fapiao_no': fapiao_no,
            # invoiceTime is epoch milliseconds.
            'fapiao_date': datetime.fromtimestamp(int(invoice_time) / 1000, UTC).replace(tzinfo=None) if invoice_time else False,
            'qr_code': invoice.get('qrCode') or False,
        }
        if pdf := self._download(invoice.get('pdfUrl')):
            result.update(pdf=pdf, pdf_filename=f"{fapiao_no}.pdf")
        return result

    def _retry_seal(self, invoice, order_no):
        env = self.company.env
        body = self._call('nuonuo.OpeMplatform.reInvoice', {'fpqqlsh': invoice.get('serialNo') or '', 'orderno': order_no})
        if body.get('code') == RETRY_LIMIT:
            # The fapiao exists unsealed: sending again targets the same order.
            return {'state': 'failed', 'error': env._("Nuonuo could not seal the fapiao of order %s and today's retries are used up.", order_no)}
        return {'state': 'sent'}

    def _download(self, url):
        """The fapiao PDF, or None: a missing copy must not undo an issued fapiao."""
        if not url:
            return None
        try:
            response = requests.get(url, timeout=TIMEOUT)
            response.raise_for_status()
        except requests.RequestException as e:
            _logger.warning("Nuonuo: could not download the fapiao PDF of company %s: %s", self.company.vat, e)
            return None
        return response.content

    # ------------------------------------------------------------------
    # Mapping
    # ------------------------------------------------------------------

    def _prepare_order(self, values):
        company = self.company
        bank = company.partner_id.bank_ids[:1]
        return {
            'orderNo': values['serial_no'],
            'invoiceDate': datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d %H:%M:%S'),
            'invoiceType': '1',
            'invoiceLine': INVOICE_LINES[values['invoice_type_code']],
            'extensionNumber': company.l10n_cn_edi_nuonuo_extension_number or '',
            'salerTaxNum': self.tax_no,
            'salerTel': company.phone or '',
            'salerAddress': ' '.join(filter(None, [company.street, company.street2, company.city])),
            'salerAccount': f"{bank.bank_name or ''} {bank.account_number or ''}".strip(),
            'buyerName': values['buyer_name'],
            'buyerTaxNum': values['buyer_tax_no'],
            'buyerTel': values['buyer_phone'] or '',
            'buyerAddress': values['buyer_address'],
            'buyerAccount': values['buyer_bank'],
            'naturalPersonFlag': '1' if values['buyer_is_natural_person'] else '0',
            # Odoo sends the fapiao PDF with its own invoice email.
            'pushMode': '-1',
            'clerk': values['drawer'],
            'remark': values['remark'],
            'invoiceDetail': [self._prepare_line(line) for line in values['lines']],
        }

    def _prepare_line(self, line):
        """One invoiceDetail. Both amounts always go along, so the basis only decides the unit price."""
        basis_amount = line['amount_total'] if line['price_include'] else line['amount_untaxed']
        detail = {
            'goodsName': line['name'],
            'goodsCode': line['tax_category_code'],
            'withTaxFlag': '1' if line['price_include'] else '0',
            'unit': line['uom'],
            'taxRate': _format_number(line['tax_rate']),
            'taxExcludedAmount': f"{line['amount_untaxed']:.2f}",
            'tax': f"{line['amount_tax']:.2f}",
            'taxIncludedAmount': f"{line['amount_total']:.2f}",
            'invoiceLineProperty': line['nature'],
            'favouredPolicyFlag': self._policy_code(line['vat_special_policy']),
            'zeroRateFlag': line['free_tax_mark'] or '',
        }
        # A discount line carries amounts only: its quantity would have to be negative.
        if line['quantity']:
            detail['num'] = _format_number(line['quantity'])
            detail['price'] = _format_number(basis_amount / line['quantity'])
        return detail

    def _policy_code(self, policy):
        """数电 wants the bureau's two-digit 增值税特殊管理 code, in the order of our selection (01 简易征收...)."""
        if not policy:
            return '0'
        selection = self.company.env['account.tax']._fields['l10n_cn_vat_special_policy'].selection
        return f"{[key for key, _label in selection].index(policy) + 1:02d}"


def _format_number(number):
    """Plain decimal notation, at most 8 decimals, no trailing zeros."""
    return f"{number:.8f}".rstrip('0').rstrip('.')
