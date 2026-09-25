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

from odoo.addons.l10n_cn_edi.models.l10n_cn_edi_document import (
    BUREAU_STATES,
    BUREAU_STATES_PENDING,
)
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
# Red letter confirmation forms (红字确认单, 联调参考 4.6).
SAVE_RED_FORM = 'nuonuo.OpeMplatform.saveInvoiceRedConfirm'
QUERY_RED_FORM = 'nuonuo.OpeMplatform.queryInvoiceRedConfirm'
REFRESH_RED_FORM = 'nuonuo.OpeMplatform.refreshInvoiceRedConfirm'  # 下载: syncs Nuonuo with the bureau
CONFIRM_RED_FORM = 'nuonuo.OpeMplatform.confirm'
REVOKE_RED_FORM = 'nuonuo.OpeMplatform.confirmInfoCancel'
SELLER, BUYER = '0', '1'  # identity / applySource
# The bureau's reason codes (ours) against Nuonuo's redReason: 1销货退回 2开票有误 3服务中止 4销售折让.
RED_REASONS = {'01': '2', '02': '1', '03': '3', '04': '4'}
RED_FORM_APPLYING, RED_FORM_APPLICATION_FAILED = '15', '16'  # 申请中, 申请失败: Nuonuo's own
BUREAU_STATES_ALL = dict(BUREAU_STATES)
RED_FORM_PAGE_SIZE = 50  # the most Nuonuo returns per page
RED_FORM_MAX_PAGES = 20

# The drawer's tax bureau session (联调参考 4.2, 4.12, 4.13).
GET_CERTIFICATION_STATUS = 'nuonuo.OpeMplatform.getCertificationStatus'
GET_QR_CODE = 'nuonuo.OpeMplatform.getQrCode'
VERIFY_COMPLETE = 'nuonuo.OpeMplatform.verifyComplete'
GET_CREDIT_LINE = 'nuonuo.OpeMplatform.getCreditLine'
LOGGED_OUT = '0'  # getCertificationStatus queryType 2: 0-未登录
IDENTITY_CONFIRMED, IDENTITY_PENDING = '1', '2'  # queryType 1: 1-已认证, 2-待认证
# getQrCode queryType per purpose: (what Nuonuo already holds, a new one from the bureau).
QR_QUERY_TYPES = {'login': ('3', '2'), 'verify': ('1', '0')}
# Getting a new QR code or login result from the bureau takes a few seconds.
SESSION_DELAYS = (2, 3)
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
    # Tax bureau session
    # ------------------------------------------------------------------

    def get_session_state(self):
        if self._certification_status('2').get('certificationStatus') == LOGGED_OUT:
            return 'login'
        if self._certification_status('1').get('certificationStatus') == IDENTITY_PENDING:
            return 'verify'
        return 'ok'

    def _certification_status(self, query_type):
        body = self._call(GET_CERTIFICATION_STATUS, self._session_payload(queryType=query_type, eleAccount=self._ele_account()))
        if body.get('code') != SUCCESS:
            # An unknown session must not hold invoices back: issuing will tell.
            _logger.warning("Nuonuo: no session status for company %s: %s %s", self.company.vat, body.get('code'), body.get('describe'))
            return {}
        return body.get('result') or {}

    def _session_payload(self, **values):
        return {'extensionNumber': self.company.l10n_cn_edi_nuonuo_extension_number or '', **values}

    def _ele_account(self):
        return self.company.l10n_cn_edi_nuonuo_ele_account or ''

    def _session_call(self, method, **values):
        body = self._call(method, self._session_payload(**values))
        if body.get('code') != SUCCESS:
            raise UserError(self.company.env._(
                "Nuonuo answered %(code)s: %(message)s",
                code=body.get('code'),
                message=body.get('describe') or '',
            ))
        return body.get('result') or {}

    def get_qr_code(self, purpose, renew=False):
        """The QR code the drawer scans to log in ('login') or to confirm their identity ('verify').

        Return ``{qr_code, qr_type, auth_id, expires}``. Nuonuo's code is reused unless
        ``renew``: the bureau hands out a new one at most once a minute, 20 times a day.
        """
        env = self.company.env
        query_type, renew_type = QR_QUERY_TYPES[purpose]
        result = {} if renew else self._session_call(GET_QR_CODE, queryType=query_type)
        if not result.get('qrCode'):
            self._session_call(GET_QR_CODE, queryType=renew_type)
            for delay in SESSION_DELAYS:
                self.wait(delay)
                result = self._session_call(GET_QR_CODE, queryType=query_type)
                if result.get('qrCode') or result.get('status') == '2':
                    break
        if not result.get('qrCode'):
            raise UserError(result.get('message') or env._("Nuonuo has no QR code yet. Please try again in a minute."))
        return {
            'qr_code': result['qrCode'],
            'qr_type': result.get('qrCodeType') or '',
            # Needed to confirm the identity check; their guide names it, their field list doesn't.
            'auth_id': result.get('authId') or '',
            'expires': result.get('endTime') or '',
        }

    def send_login_sms(self):
        """Text a login code to the drawer's phone."""
        self._session_call(GET_QR_CODE, queryType='4')

    def confirm_login(self, sms_code=None):
        """Complete the login after the scan, or with the texted code. Return whether the bureau accepted it."""
        env = self.company.env
        if sms_code:
            self._session_call(VERIFY_COMPLETE, queryType='2', verifyCode=int(sms_code))
        else:
            self._session_call(VERIFY_COMPLETE, queryType='0')
        result_type = '3' if sms_code else '1'
        result = self._session_call(VERIFY_COMPLETE, queryType=result_type)
        for delay in SESSION_DELAYS:
            if result.get('status') != '0':  # 0-登录执行中
                break
            self.wait(delay)
            result = self._session_call(VERIFY_COMPLETE, queryType=result_type)
        if result.get('status') == '2':
            raise UserError(result.get('message') or env._("The tax bureau refused the login."))
        return result.get('status') == '1'

    def confirm_identity(self, auth_id):
        """After the drawer scanned the identity QR code, sync the bureau's verdict. Return whether it's confirmed.

        Nuonuo allows this once every 30 s, 20 times a day.
        """
        self._session_call(GET_CERTIFICATION_STATUS, queryType='0', authId=auth_id or '', eleAccount=self._ele_account())
        return self._certification_status('1').get('certificationStatus') == IDENTITY_CONFIRMED

    def get_credit_line(self):
        """The company's invoicing quota (授信额度, tax excluded), as Nuonuo last got it from the bureau.

        Return ``{available, used, total, updated}``.
        """
        env = self.company.env
        result = self._session_call(GET_CREDIT_LINE, queryType='1')
        if result.get('availableCreditLine') is None:
            # Nuonuo holds no figure yet: have it fetched (at most once per 30 s, 20 times a day).
            self._session_call(GET_CREDIT_LINE, queryType='0')
            for delay in SESSION_DELAYS:
                self.wait(delay)
                result = self._session_call(GET_CREDIT_LINE, queryType='1')
                if result.get('availableCreditLine') is not None or result.get('requestStatus') == '2':
                    break
        if result.get('requestStatus') == '2':
            raise UserError(result.get('message') or env._("The tax bureau didn't give the credit line."))
        if result.get('availableCreditLine') is None:
            raise UserError(env._("Nuonuo is still fetching the credit line from the tax bureau. Please try again in a minute."))
        return {
            'available': float(result['availableCreditLine']),
            'used': float(result.get('usedCreditLine') or 0.0),
            'total': float(result.get('totalCreditLine') or 0.0),
            'updated': result.get('amountUpdateTime') or '',
        }

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
        for kind in ('pdf', 'ofd'):
            if content := self._download(invoice.get(f'{kind}Url')):
                result.update({kind: content, f'{kind}_filename': f"{fapiao_no}.{kind}"})
        return result

    def _retry_seal(self, invoice, order_no):
        env = self.company.env
        body = self._call('nuonuo.OpeMplatform.reInvoice', {'fpqqlsh': invoice.get('serialNo') or '', 'orderno': order_no})
        if body.get('code') == RETRY_LIMIT:
            # The fapiao exists unsealed: sending again targets the same order.
            return {'state': 'failed', 'error': env._("Nuonuo could not seal the fapiao of order %s and today's retries are used up.", order_no)}
        return {'state': 'sent'}

    def _download(self, url):
        """A fapiao file, or None: a missing copy must not undo an issued fapiao."""
        if not url:
            return None
        try:
            response = requests.get(url, timeout=TIMEOUT)
            response.raise_for_status()
        except requests.RequestException as e:
            _logger.warning("Nuonuo: could not download a fapiao file of company %s: %s", self.company.vat, e)
            return None
        return response.content

    # ------------------------------------------------------------------
    # Red forms
    # ------------------------------------------------------------------

    def request_red_form(self, values):
        env = self.company.env
        company = self.company
        bill_id = values['serial_no']
        # Full reversal: no lines (联调参考 4.7.1). The bureau issues the red fapiao itself
        # once the form needs no confirmation or both sides confirmed it.
        body = self._call(SAVE_RED_FORM, {
            'billId': bill_id,
            'blueInvoiceLine': INVOICE_LINES[values['original_invoice_type_code'] or '02'],
            'applySource': SELLER,
            'blueElecInvoiceNumber': values['original_fapiao_no'],
            'sellerTaxNo': self.tax_no,
            'sellerName': values['seller_name'],
            'buyerTaxNo': values['buyer_tax_no'],
            'buyerName': values['buyer_name'],
            'redReason': RED_REASONS[values['reason']],
            'extensionNumber': company.l10n_cn_edi_nuonuo_extension_number or '',
        })
        if body.get('code') != SUCCESS:
            # A resubmitted billId is refused as a duplicate: the form exists, so read it back.
            if form := self._find_red_form(SELLER, bill_id):
                return self._red_form_result(form, fetch_red_fapiao=True)
            return {'error': env._("Nuonuo refused the red form (%(code)s): %(message)s", code=body.get('code'), message=body.get('describe') or '')}
        form = self._find_red_form(SELLER, bill_id)
        return self._red_form_result(form, fetch_red_fapiao=True) if form else {'uuid': bill_id}

    def query_red_form(self, document):
        identity = self._identity(document)
        form = self._find_red_form(identity, document.red_form_uuid)
        if form and form.get('billStatus') in BUREAU_STATES_PENDING and form.get('billUuid'):
            # Someone has to act at the bureau: download its latest state into Nuonuo first.
            self._call(REFRESH_RED_FORM, {'identity': identity, 'billUuid': form['billUuid']})
            form = self._find_red_form(identity, document.red_form_uuid) or form
        if not form:
            return {}
        return self._red_form_result(form, fetch_red_fapiao=identity == SELLER)

    def operate_red_form(self, document, action):
        env = self.company.env
        identity = self._identity(document)
        payload = {
            'billId': document.red_form_uuid,
            'identity': identity,
            'extensionNumber': self.company.l10n_cn_edi_nuonuo_extension_number or '',
        }
        if action == 'revoke':
            body = self._call(REVOKE_RED_FORM, payload)
        else:
            body = self._call(CONFIRM_RED_FORM, {**payload, 'confirmAgreement': '1' if action == 'confirm' else '0'})
        if body.get('code') != SUCCESS:
            raise UserError(env._("Nuonuo answered %(code)s: %(message)s", code=body.get('code'), message=body.get('describe') or ''))

    def list_inbound_red_forms(self, date_from, date_to):
        window = {'startTime': f'{date_from:%Y-%m-%d}', 'endTime': f'{date_to:%Y-%m-%d}'}
        # Forms raised by suppliers at the bureau reach Nuonuo only when downloaded.
        self._call(REFRESH_RED_FORM, {
            'identity': BUYER,
            'extensionNumber': self.company.l10n_cn_edi_nuonuo_extension_number or '',
            **window,
        })
        forms = []
        for page in range(1, RED_FORM_MAX_PAGES + 1):
            result = self._query_red_forms({
                'identity': BUYER,
                'billTimeStart': window['startTime'],
                'billTimeEnd': window['endTime'],
                'pageNo': str(page),
                'pageSize': str(RED_FORM_PAGE_SIZE),
            })
            batch = result.get('list') or []
            forms += batch
            if len(batch) < RED_FORM_PAGE_SIZE or len(forms) >= int(result.get('total') or 0):
                break
        return [self._red_form_result(form) for form in forms if form.get('applySource') is not None and str(form['applySource']) == SELLER]

    def _identity(self, document):
        return BUYER if document.move_id.move_type in ('in_invoice', 'in_refund') else SELLER

    def _query_red_forms(self, payload):
        env = self.company.env
        body = self._call(QUERY_RED_FORM, payload)
        if body.get('code') != SUCCESS:
            raise UserError(env._("Nuonuo could not list red forms (%(code)s): %(message)s", code=body.get('code'), message=body.get('describe') or ''))
        return body.get('result') or {}

    def _find_red_form(self, identity, bill_id):
        # A billId makes the date range optional (unlike a bare query, which needs one).
        forms = self._query_red_forms({'identity': identity, 'billId': bill_id}).get('list') or []
        return forms[0] if forms else None

    def _red_form_result(self, form, fetch_red_fapiao=False):
        env = self.company.env
        status = str(form.get('billStatus') or '')
        result = {
            'uuid': form.get('billId'),
            'number': form.get('billNo') or False,
            'bureau_state': status if status in BUREAU_STATES_ALL else False,
            'red_fapiao_no': form.get('redInvoiceNumber') or False,
            'original_fapiao_no': form.get('blueElecInvoiceNumber') or form.get('blueInvoiceNumber') or False,
            'amount_untaxed': float(form.get('taxExcludedAmount') or 0.0),
            'amount_tax': float(form.get('taxAmount') or 0.0),
            'reason': {nuonuo: ours for ours, nuonuo in RED_REASONS.items()}.get(str(form.get('redReason') or '')) or False,
        }
        if status == RED_FORM_APPLICATION_FAILED:
            result['error'] = form.get('billMessage') or env._("The tax bureau refused the red form.")
        if fetch_red_fapiao and result['red_fapiao_no'] and form.get('invoiceSerialNum'):
            result.update(self._red_fapiao(form['invoiceSerialNum']))
        return result

    def _red_fapiao(self, serial_no):
        """Date and files of the red fapiao the bureau issued for a form."""
        body = self._call('nuonuo.OpeMplatform.queryInvoiceResult', {'serialNos': [serial_no], 'isOfferInvoiceDetail': '0'})
        invoices = body.get('result') or []
        if body.get('code') != SUCCESS or not invoices or str(invoices[0].get('status')) != STATUS_ISSUED:
            # The number is known from the form: the date and files can wait for a later look.
            return {}
        issued = self._issued_result(invoices[0])
        return {
            'red_fapiao_date': issued['fapiao_date'],
            **{key: issued[key] for key in ('pdf', 'pdf_filename', 'ofd', 'ofd_filename') if key in issued},
        }

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
