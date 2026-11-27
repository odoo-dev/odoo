# Part of Odoo. See LICENSE file for full copyright and licensing details.
import re
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from stdnum.kr import brn

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.tools import float_compare, float_repr, float_round, split_every

from .account_move import L10N_KR_EDI_SENDABLE_ISSUANCE_TYPES

L10N_KR_EDI_BAROBILL_CANCELLED_STATES = (5013, 5023, 5031)
L10N_KR_EDI_NTS_SEND_FAILED_STATES = (5,)
L10N_KR_EDI_BAROBILL_STATES_BATCH_SIZE = 1000
L10N_KR_EDI_NTS_SEND_STATES = {
    2: 'sent',
    3: 'sent',
    4: 'success',
    5: 'error',
}
L10N_KR_EDI_CASH_RECEIPT_STATES = {
    2500: 'sent',
    3000: 'success',
    4000: 'error',
    7000: 'canceled',
}
L10N_KR_EDI_CASH_RECEIPT_DELETABLE_STATES = (4000, 7000)
L10N_KR_EDI_CASH_RECEIPT_MAX_AMOUNT = 999999999
L10N_KR_EDI_MOBILE_PHONE_REGEX = re.compile(r'01[016789]\d{7,8}')
L10N_KR_EDI_CASH_RECEIPT_SELF_ISSUANCE_NUMBER = '0100001234'
L10N_KR_EDI_BRN_WEIGHTS = (1, 3, 7, 1, 3, 7, 1, 3, 5)
L10N_KR_EDI_TAX_TYPES = {
    'tax_group_vat': 1,
    'tax_group_zero_rate': 2,
    'tax_group_exempt': 3,
}


class L10n_Kr_EdiDocument(models.Model):
    _name = 'l10n_kr_edi.document'
    _description = "Korean e-Tax Invoice or Cash Receipt issued through Barobill"
    _order = 'id desc'

    move_id = fields.Many2one(comodel_name='account.move', required=True, readonly=True, index=True, ondelete='cascade')
    company_id = fields.Many2one(related='move_id.company_id', store=True)
    document_type = fields.Selection(
        selection=[
            ('tax_invoice', "e-Tax Invoice"),
            ('tax_exempt_invoice', "e-Tax-exempt Invoice"),
            ('cash_receipt', "Cash Receipt"),
        ],
        string="Document Type",
        required=True,
        readonly=True,
    )
    mgt_key = fields.Char(string="Barobill Management Number", required=True, readonly=True)
    state = fields.Selection(
        selection=[
            ('issued', "Issued"),
            ('sent', "Sent to NTS"),
            ('success', "NTS Success"),
            ('error', "NTS Error"),
            ('canceled', "Canceled"),
        ],
        string="Status",
        help="Issued: issued on Barobill but not sent to the NTS yet. It can still be cancelled.\n"
             "Sent to NTS: waiting to be sent or being sent to the NTS. The NTS can still reject it.\n"
             "NTS Success: accepted by the NTS.\n"
             "NTS Error: rejected by the NTS. The reason is logged in the chatter. Reset the invoice to draft to fix it and issue it again.\n"
             "Canceled: cancelled on Barobill before it reached the NTS.",
        required=True,
        readonly=True,
        default='issued',
    )
    nts_send_date = fields.Datetime(string="NTS Submission Date", readonly=True)

    def action_refresh_state(self):
        self.ensure_one()
        state, error = self._fetch_state()
        if error:
            raise UserError(error)
        self._update_state(state)

    def action_cancel(self):
        self.ensure_one()
        state, error = self._fetch_state()
        if error:
            raise UserError(error)
        self._update_state(state)
        if self.state != 'issued':
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'type': 'warning',
                    'message': self.env._("The e-Tax Invoice can no longer be cancelled. Its status has been updated."),
                    'next': {'type': 'ir.actions.client', 'tag': 'soft_reload'},
                },
            }
        _result, error = self.company_id._l10n_kr_edi_barobill_call(
            'TI',
            'ProcTaxInvoice',
            MgtKey=self.mgt_key,
            ProcType='ISSUE_CANCEL',
            Memo='',
        )
        if error:
            raise UserError(error)
        self.state = 'canceled'

    @api.model
    def _cron_refresh_state(self):
        documents = self.search([('state', 'in', ('issued', 'sent'))])
        self.env['ir.cron']._commit_progress(remaining=len(documents))
        documents_by_service = documents.grouped(lambda document: (document.company_id, document.document_type == 'cash_receipt'))
        for (company, _is_cash_receipt), service_documents in documents_by_service.items():
            for batch in split_every(L10N_KR_EDI_BAROBILL_STATES_BATCH_SIZE, service_documents.ids, self.browse):
                mgt_keys = list(dict.fromkeys(batch.mapped('mgt_key')))
                states, _error = self._fetch_barobill_states(company, batch[0].document_type, mgt_keys)
                for document in batch:
                    state = states.get(document.mgt_key)
                    if state and state.BarobillState > 0:
                        document._update_state(state)
                if not self.env['ir.cron']._commit_progress(len(batch)):
                    return

    @api.model
    def _fetch_barobill_states(self, company, document_type, mgt_keys):
        if document_type == 'cash_receipt':
            result, error = company._l10n_kr_edi_barobill_call(
                'CASHBILL',
                'GetCashBillStates',
                UserID=company.sudo().l10n_kr_edi_barobill_id,
                MgtKeyList={'string': mgt_keys},
            )
        else:
            result, error = company._l10n_kr_edi_barobill_call('TI', 'GetTaxInvoiceStatesEX', MgtKeyList={'string': mgt_keys})
        if error:
            return {}, error
        if len(result or []) != len(mgt_keys):
            return {}, self.env._("Barobill returned an unexpected number of statuses.")
        return dict(zip(mgt_keys, result)), None

    @api.model
    def _delete_barobill_document(self, company, document_type, mgt_key):
        if document_type == 'cash_receipt':
            _result, error = company._l10n_kr_edi_barobill_call(
                'CASHBILL',
                'DeleteCashBill',
                UserID=company.sudo().l10n_kr_edi_barobill_id,
                MgtKey=mgt_key,
            )
        else:
            _result, error = company._l10n_kr_edi_barobill_call('TI', 'DeleteTaxInvoice', MgtKey=mgt_key)
        return error

    def _fetch_state(self):
        self.ensure_one()
        states, error = self._fetch_barobill_states(self.company_id, self.document_type, [self.mgt_key])
        if error:
            return None, error
        state = states[self.mgt_key]
        if state.BarobillState < 0:
            return state, self.env._("This document was not found on Barobill.")
        return state, None

    def _update_state(self, state):
        self.ensure_one()
        edocument_number = False
        if self.document_type == 'cash_receipt':
            values = {'state': L10N_KR_EDI_CASH_RECEIPT_STATES.get(state.BarobillState, 'issued')}
            if values['state'] == 'success':
                edocument_number = state.NTSConfirmNum
            send_date = state.NTSConfirmDT or state.NTSSendDT
            error_reason = state.NTSConfirmMessage
        else:
            if state.BarobillState in L10N_KR_EDI_BAROBILL_CANCELLED_STATES:
                values = {'state': 'canceled'}
            else:
                values = {'state': L10N_KR_EDI_NTS_SEND_STATES.get(state.NTSSendState, 'issued')}
            if values['state'] == 'success':
                edocument_number = state.NTSSendKey
            send_date = state.NTSResultDT or state.NTSSendDT
            error_reason = self._get_nts_send_result_message(state.NTSSendResult)
        if values['state'] in ('sent', 'success'):
            values['nts_send_date'] = self._parse_barobill_datetime(send_date)
        if values['state'] == self.state:
            return
        self.write(values)
        if edocument_number:
            self.move_id.l10n_kr_edocument_number = edocument_number
        if self.state == 'error':
            self.move_id.message_post(body=self.env._("The NTS rejected this document: %(reason)s", reason=error_reason))

    @api.model
    def _get_nts_send_result_message(self, code):
        messages = {
            'SYN002': self.env._("The electronic signature of the supplier or trustee is not valid."),
            'SYN003': self.env._("The NTS approval number format is not valid."),
            'SYN004': self.env._("The e-Tax Invoice structure is not valid."),
            'ERR001': self.env._("The supplier's business registration number is not registered with the NTS."),
            'ERR002': self.env._("The customer's business registration number is not registered with the NTS."),
            'ERR003': self.env._("The trustee's business registration number is not registered with the NTS."),
            'ERR004': self.env._("The document was not sent to the NTS on the day it was issued."),
            'ERR005': self.env._("The issue date is not valid or is after the submission date."),
            'ERR006': self.env._("The invoice date is not valid, is after the issue date, or is outside the tax period."),
            'ERR007': self.env._("The supply value and the tax have different signs, or a returned goods or cancelled contract amendment has a positive amount."),
            'ERR008': self.env._("The tax invoice type, the customer identification type or the amendment reason is not valid."),
            'ERR009': self.env._("The supplier or trustee issued the document after closing their business."),
            'ERR010': self.env._("The NTS registration number of the issuing and sending systems do not match."),
            'ERR011': self.env._("The original NTS approval number is missing or does not belong to the supplier, or is set on a non-amended e-Tax Invoice."),
            'ERR999': self.env._("Other error."),
        }
        return self.env._("%(code)s: %(message)s", code=code, message=messages[code]) if code in messages else code

    @api.model
    def _parse_barobill_datetime(self, value):
        if not value:
            return False
        local_datetime = datetime.strptime(value, '%Y%m%d%H%M%S').replace(tzinfo=ZoneInfo('Asia/Seoul'))
        return local_datetime.astimezone(UTC).replace(tzinfo=None)

    @api.model
    def _issue_tax_invoice(self, move):
        reversal_move = move.l10n_kr_edi_reversal_move_id.filtered(lambda reversal: reversal.l10n_kr_edi_state in (False, 'canceled'))
        errors = self._get_tax_invoice_errors(move)
        if reversal_move:
            errors += [
                self.env._("%(move)s: %(error)s", move=reversal_move.name, error=error)
                for error in self._get_tax_invoice_errors(reversal_move)
            ]
        if errors:
            return errors
        if reversal_move:
            errors = self._issue_tax_invoice(reversal_move)
            if reversal_move.l10n_kr_edi_state not in ('issued', 'sent', 'success'):
                return errors
        document_values = self._prepare_document_values(move)
        states, error = self._fetch_barobill_states(move.company_id, document_values['document_type'], [document_values['mgt_key']])
        if error:
            return [error]
        state = states[document_values['mgt_key']]
        if state.BarobillState in L10N_KR_EDI_BAROBILL_CANCELLED_STATES or state.NTSSendState in L10N_KR_EDI_NTS_SEND_FAILED_STATES:
            if error := self._delete_barobill_document(move.company_id, document_values['document_type'], document_values['mgt_key']):
                return [error]
        elif state.BarobillState > 0:
            self.create(document_values)._update_state(state)
            return [self.env._("This invoice was already issued on Barobill. Its e-Tax Invoice status has been updated.")]
        _result, error = move.company_id._l10n_kr_edi_barobill_call(
            'TI',
            'RegistAndIssueTaxInvoice',
            Invoice=self._prepare_tax_invoice_values(move),
            SendSMS=False,
            ForceIssue=True,
            MailTitle='',
        )
        if error:
            return [error]
        move.l10n_kr_issuance_type = document_values['document_type']
        document = self.create(document_values)
        state, error = document._fetch_state()
        if not error:
            document._update_state(state)
        return []

    @api.model
    def _issue_cash_receipt(self, move):
        if errors := self._get_cash_receipt_errors(move):
            return errors
        document_values = self._prepare_document_values(move)
        states, error = self._fetch_barobill_states(move.company_id, document_values['document_type'], [document_values['mgt_key']])
        if error:
            return [error]
        state = states[document_values['mgt_key']]
        if state.BarobillState in L10N_KR_EDI_CASH_RECEIPT_DELETABLE_STATES:
            if error := self._delete_barobill_document(move.company_id, document_values['document_type'], document_values['mgt_key']):
                return [error]
        elif state.BarobillState > 0:
            self.create(document_values)._update_state(state)
            return [self.env._("This invoice was already issued on Barobill. Its cash receipt status has been updated.")]
        _result, error = move.company_id._l10n_kr_edi_barobill_call(
            'CASHBILL',
            'RegistAndIssueCashBill',
            UserID=move.company_id.sudo().l10n_kr_edi_barobill_id,
            Invoice=self._prepare_cash_receipt_values(move),
            SMSSendYN=False,
            MailTitle='',
        )
        if error:
            return [error]
        document = self.create(document_values)
        state, error = document._fetch_state()
        if not error:
            document._update_state(state)
        return []

    @api.model
    def _get_mgt_key(self, move):
        # Barobill rejects invoices with '/' character in the MgtKey
        return move.name.replace('/', '-')

    @api.model
    def _prepare_document_values(self, move):
        return {
            'move_id': move.id,
            'document_type': L10N_KR_EDI_SENDABLE_ISSUANCE_TYPES[move.l10n_kr_issuance_type],
            'mgt_key': self._get_mgt_key(move),
        }

    # -------------------------------------------------------------------------
    # BAROBILL TAX INVOICE
    # -------------------------------------------------------------------------

    @api.model
    def _get_tax_type(self, move):
        ChartTemplate = self.env['account.chart.template'].with_company(move.company_id)
        tax_type_by_group = {
            tax_group: tax_type
            for xmlid, tax_type in L10N_KR_EDI_TAX_TYPES.items()
            if (tax_group := ChartTemplate.ref(xmlid, raise_if_not_found=False))
        }
        tax_types = {
            tax_type_by_group.get(tax.tax_group_id)
            for tax in move.invoice_line_ids.filtered(lambda line: line.display_type == 'product').tax_ids
        }
        return tax_types.pop() if len(tax_types) == 1 else False

    @api.model
    def _get_common_errors(self, move):
        errors = []
        if move.company_id.currency_id.name != 'KRW':
            errors.append(self.env._("Your company currency must be KRW to issue documents through Barobill."))
        elif float_compare(move.company_id.currency_id.rounding, 1.0, precision_digits=6):
            errors.append(self.env._("The KRW currency must be configured without decimals (rounding factor 1) to issue documents through Barobill."))
        if len(self._get_mgt_key(move)) > 24:
            errors.append(self.env._("The invoice number must be 24 characters or less to be used as the Barobill management number."))
        if not move.invoice_line_ids.filtered(lambda line: line.display_type == 'product'):
            errors.append(self.env._("The invoice has no product lines."))
        if not move.company_id.sudo().l10n_kr_edi_barobill_id:
            errors.append(self.env._("The Barobill ID must be set in the Accounting settings."))
        return errors

    @api.model
    def _get_tax_invoice_errors(self, move):
        errors = self._get_common_errors(move)
        company_partner = move.company_id.partner_id
        partner = move.commercial_partner_id
        product_lines = move.invoice_line_ids.filtered(lambda line: line.display_type == 'product')

        if len(product_lines) > 99:
            errors.append(self.env._("An e-Tax Invoice can have at most 99 lines."))
        if any(
            line.l10n_kr_edi_supply_date
            and line.l10n_kr_edi_supply_date.replace(day=1) != move.invoice_date.replace(day=1)
            for line in product_lines
        ):
            errors.append(self.env._("The supply date of every line must be in the same month as the invoice date."))
        if company_partner.country_code != 'KR' or not company_partner.has_vat:
            errors.append(self.env._("Your company must be located in South Korea and have a business registration number."))
        if not partner.has_vat:
            errors.append(self.env._("The customer must have a business registration number."))
        for party, label in ((company_partner, self.env._("Your company")), (partner, self.env._("The customer"))):
            if not party.l10n_kr_representative_name:
                errors.append(self.env._("%(party)s must have a representative name.", party=label))
            if not party.street:
                errors.append(self.env._("%(party)s must have an address.", party=label))
        if not company_partner.email:
            errors.append(self.env._("Your company must have an email address."))

        tax_type = self._get_tax_type(move)
        if any(not line.tax_ids for line in product_lines):
            errors.append(self.env._("Every line must have a tax."))
        elif not tax_type:
            errors.append(self.env._("All lines must use taxes of the same type: either 10%, 0% or exempt."))
        elif move.l10n_kr_issuance_type == 'tax_exempt_invoice' and tax_type != 3:
            errors.append(self.env._("A tax-exempt invoice can only contain exempt taxes."))
        elif move.l10n_kr_issuance_type != 'tax_exempt_invoice' and tax_type == 3:
            errors.append(self.env._("Exempt taxes must be issued as a tax-exempt invoice."))

        if origin := move.l10n_kr_edi_origin_move_id:
            code = move.l10n_kr_edi_amendment_code
            if not code:
                errors.append(self.env._("An amendment reason is required to issue an amended e-Tax Invoice."))
            elif move.debit_origin_id and code != '2':
                errors.append(self.env._("A debit note can only be issued for a change in supply value."))
            elif (
                move.move_type == 'out_refund'
                and code in ('1', '4', '6')
                and move.company_id.currency_id.compare_amounts(abs(move.amount_total_signed), abs(origin.amount_total_signed))
            ):
                errors.append(self.env._("This amendment reason requires the credit note to cancel the full original invoice."))
            elif move.move_type == 'out_invoice' and code == '5' and tax_type != L10N_KR_EDI_TAX_TYPES['tax_group_zero_rate']:
                errors.append(self.env._("The new invoice for a local L/C opened afterwards must only contain 0% taxes."))
            if not origin.l10n_kr_edocument_number:
                errors.append(self.env._("The original invoice has no NTS approval number yet."))
        return errors

    @api.model
    def _is_valid_brn(self, number):
        if not brn.is_valid(number or ''):
            return False
        digits = [int(digit) for digit in brn.compact(number)]
        total = sum(digit * weight for digit, weight in zip(digits, L10N_KR_EDI_BRN_WEIGHTS)) + digits[8] * 5 // 10
        return (10 - total % 10) % 10 == digits[9]

    @api.model
    def _get_cash_receipt_identity(self, move):
        partner = move.commercial_partner_id
        if partner.has_vat:
            return ('4', brn.compact(partner.vat)) if self._is_valid_brn(partner.vat) else (False, False)
        if not move.partner_id.phone:
            return ('5', L10N_KR_EDI_CASH_RECEIPT_SELF_ISSUANCE_NUMBER)
        phone = ''.join(filter(str.isdigit, move.partner_id.phone))
        if phone.startswith('82'):
            phone = '0' + phone[2:].lstrip('0')
        return ('5', phone) if L10N_KR_EDI_MOBILE_PHONE_REGEX.fullmatch(phone) else (False, False)

    @api.model
    def _get_cash_receipt_errors(self, move):
        errors = self._get_common_errors(move)
        company_partner = move.company_id.partner_id
        partner = move.commercial_partner_id

        if company_partner.country_code != 'KR' or not self._is_valid_brn(company_partner.vat):
            errors.append(self.env._("Your company must be located in South Korea and have a valid business registration number."))
        if not company_partner.l10n_kr_representative_name:
            errors.append(self.env._("Your company must have a representative name."))
        if not company_partner.street:
            errors.append(self.env._("Your company must have an address."))
        if not company_partner.phone:
            errors.append(self.env._("Your company must have a phone number."))

        trade_method, _identity_number = self._get_cash_receipt_identity(move)
        if not trade_method:
            if partner.has_vat:
                errors.append(self.env._("The customer's business registration number is not valid."))
            else:
                errors.append(self.env._("The customer's phone number must be a South Korean mobile phone number to issue a cash receipt."))

        if move.invoice_date < datetime.now(ZoneInfo('Asia/Seoul')).date() - timedelta(days=1):
            errors.append(self.env._("A cash receipt can only be issued for invoices dated today or yesterday."))
        if max(abs(move.amount_untaxed_signed), abs(move.amount_tax_signed)) > L10N_KR_EDI_CASH_RECEIPT_MAX_AMOUNT:
            errors.append(self.env._("A cash receipt cannot exceed 999,999,999 KRW."))
        unreconciled_payments = move.matched_payment_ids.filtered(lambda payment: not payment.move_id and payment.state == 'paid')
        if move.move_type == 'out_invoice' and (
            move.payment_state not in ('paid', 'in_payment')
            or move.currency_id.compare_amounts(sum(unreconciled_payments.mapped('amount')), move.amount_residual) < 0
        ):
            errors.append(self.env._("A cash receipt can only be issued once the invoice is fully paid."))
        if move.move_type == 'out_refund':
            if not move.l10n_kr_edi_cash_receipt_cancel_code:
                errors.append(self.env._("A cancellation reason is required to cancel a cash receipt."))
            if not move.reversed_entry_id.l10n_kr_edocument_number:
                errors.append(self.env._("The original cash receipt has no NTS approval number yet."))
        return errors

    @api.model
    def _prepare_party_values(self, partner, contact):
        return {
            'MgtNum': '',
            'CorpNum': ''.join(filter(str.isdigit, partner.vat or '')),
            'TaxRegID': '',
            'CorpName': (partner.name or '').replace('㈜', '(주)'),
            'CEOName': partner.l10n_kr_representative_name or '',
            'Addr': ' '.join(filter(None, [partner.state_id.name, partner.city, partner.street, partner.street2])),
            'BizType': partner.industry_id.name or '',
            'BizClass': '',
            'ContactID': '',
            'ContactName': contact.name or '',
            'TEL': contact.phone or partner.phone or '',
            'HP': '',
            'Email': contact.email or partner.email or '',
        }

    @api.model
    def _prepare_line_values(self, move):
        AccountTax = self.env['account.tax']
        sign = -1 if move.move_type == 'out_refund' else 1
        base_lines, _tax_lines = move._get_rounded_base_and_tax_lines()
        base_lines_aggregated_values = AccountTax._aggregate_base_lines_tax_details(base_lines, lambda base_line, tax_data: True)
        lines = []
        for base_line, aggregated_values in base_lines_aggregated_values:
            line = base_line['record']
            if line.display_type != 'product':
                continue
            values = aggregated_values[True]
            amount = values['base_amount']
            quantity = line.quantity
            raw_amount = base_line['tax_details']['raw_total_excluded']
            lines.append({
                'PurchaseExpiry': line.l10n_kr_edi_supply_date.strftime('%Y%m%d') if line.l10n_kr_edi_supply_date else '',
                'Name': line.product_id.name or line.name or '',
                'Information': '',
                'ChargeableUnit': float_repr(sign * quantity, 2),
                'UnitPrice': float_repr(float_round(raw_amount / quantity if quantity else 0.0, precision_digits=2), 2),
                'Amount': float_repr(sign * amount, 0),
                'Tax': float_repr(sign * values['tax_amount'], 0),
                'Description': '',
            })
        return lines

    @api.model
    def _prepare_tax_invoice_values(self, move):
        sign = -1 if move.move_type == 'out_refund' else 1
        company_partner = move.company_id.partner_id
        invoicer = self._prepare_party_values(company_partner, company_partner)
        invoicer.update({
            'MgtNum': self._get_mgt_key(move),
            'ContactID': move.company_id.sudo().l10n_kr_edi_barobill_id or '',
            'ContactName': (move.invoice_user_id or self.env.user).name,
        })
        invoicee = self._prepare_party_values(move.commercial_partner_id, move.partner_id)
        is_amendment = bool(move.l10n_kr_edi_origin_move_id)
        return {
            'InvoicerParty': invoicer,
            'InvoiceeParty': invoicee,
            'IssueDirection': 1,
            'TaxInvoiceType': 2 if move.l10n_kr_issuance_type == 'tax_exempt_invoice' else 1,
            'TaxType': self._get_tax_type(move) or 1,
            'TaxCalcType': 1,
            'PurposeType': 1 if move.payment_state in ('paid', 'in_payment') else 2,
            'ModifyCode': (is_amendment and move.l10n_kr_edi_amendment_code) or '',
            'WriteDate': move.invoice_date.strftime('%Y%m%d'),
            'AmountTotal': float_repr(move.amount_untaxed_signed, 0),
            'TaxTotal': float_repr(move.amount_tax_signed, 0),
            'TotalAmount': float_repr(move.amount_total_signed, 0),
            'Cash': '',
            'ChkBill': '',
            'Note': '',
            'Credit': '',
            'Remark1': (is_amendment and move.l10n_kr_edi_origin_move_id.l10n_kr_edocument_number) or '',
            'Remark2': '',
            'Remark3': '',
            'Kwon': '',
            'Ho': '',
            'SerialNum': '',
            'TaxInvoiceTradeLineItems': {
                'TaxInvoiceTradeLineItem': self._prepare_line_values(move),
            },
        }

    # -------------------------------------------------------------------------
    # BAROBILL CASH RECEIPT
    # -------------------------------------------------------------------------

    @api.model
    def _prepare_cash_receipt_values(self, move):
        company_partner = move.company_id.partner_id
        franchise = self._prepare_party_values(company_partner, company_partner)
        trade_method, identity_number = self._get_cash_receipt_identity(move)
        origin = move.reversed_entry_id
        product_lines = move.invoice_line_ids.filtered(lambda line: line.display_type == 'product')
        item_name = product_lines[0].product_id.name or product_lines[0].name or ''
        if len(product_lines) > 1:
            item_name = self.env._("%(item)s and %(count)s more", item=item_name, count=len(product_lines) - 1)
        return {
            'MgtKey': self._get_mgt_key(move),
            'NTSConfirmNum': '',
            'FranchiseCorpNum': franchise['CorpNum'],
            'FranchiseMemberID': move.company_id.sudo().l10n_kr_edi_barobill_id or '',
            'FranchiseCorpName': franchise['CorpName'],
            'FranchiseCEOName': franchise['CEOName'],
            'FranchiseAddr': franchise['Addr'],
            'FranchiseTel': franchise['TEL'],
            'IdentityNum': identity_number,
            'HP': '',
            'Fax': '',
            'Email': move.partner_id.email or '',
            'TradeDate': move.invoice_date.strftime('%Y%m%d'),
            'TradeType': 'D' if origin else 'N',
            'TradeUsage': '2' if trade_method == '4' else '1',
            'TradeDeductionType': '',
            'TradeMethod': trade_method,
            'ItemName': item_name[:70],
            'Amount': float_repr(abs(move.amount_untaxed_signed), 0),
            'Tax': float_repr(abs(move.amount_tax_signed), 0),
            'ServiceCharge': '0',
            'CancelType': move.l10n_kr_edi_cash_receipt_cancel_code if origin else '',
            'CancelNTSConfirmNum': origin.l10n_kr_edocument_number or '',
            'CancelNTSConfirmDate': origin.invoice_date.strftime('%Y%m%d') if origin else '',
        }
