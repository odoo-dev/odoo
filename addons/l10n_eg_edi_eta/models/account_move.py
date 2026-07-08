# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
import logging
import json
import requests

from json import JSONDecodeError
from odoo import api, models, fields, _
from odoo.addons.account.tools import LegacyHTTPAdapter
from odoo.tools import float_is_zero
from odoo.tools.float_utils import json_float_round
from odoo.addons.l10n_eg_edi_eta.models.eta_submission import ETA_SUBMISSION_STATES

_logger = logging.getLogger(__name__)

ETA_DOMAINS = {
    'demo': 'https://api.preprod.invoicing.eta.gov.eg',
    'production': 'https://api.invoicing.eta.gov.eg',
    'invoice.demo': 'https://preprod.invoicing.eta.gov.eg/',
    'invoice.production': 'https://invoicing.eta.gov.eg',
    'token.demo': 'https://id.preprod.eta.gov.eg',
    'token.production': 'https://id.eta.gov.eg',
}


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_eg_long_id = fields.Char(string='ETA Long ID', compute='_compute_l10n_eg_edi_submission_details')
    l10n_eg_qr_code = fields.Char(string='ETA QR Code', compute='_compute_eta_qr_code_str')
    l10n_eg_uuid = fields.Char(
        string='Document UUID',
        compute='_compute_l10n_eg_edi_uuid',
        store=True,
        copy=False,
        init_storage=lambda model: None
    )
    l10n_eg_eta_json_doc_file = fields.Binary(
        string='ETA JSON Document',
        attachment=True,
        copy=False,
    )
    l10n_eg_eta_submission_ids = fields.One2many(
        'l10n_eg_edi.eta.submission',
        'move_id',
        string='ETA Submissions',
        copy=False,
    )
    l10n_eg_edi_demo_mode = fields.Boolean(related='company_id.l10n_eg_edi_demo_mode', string='ETA Mode')
    l10n_eg_edi_submission_state = fields.Selection(
        selection=ETA_SUBMISSION_STATES,
        string="ETA State",
        compute='_compute_l10n_eg_edi_submission_details',
    )

    @api.depends('invoice_date', 'l10n_eg_uuid', 'l10n_eg_long_id')
    def _compute_eta_qr_code_str(self):
        for move in self:
            if move.invoice_date and move.l10n_eg_uuid and move.l10n_eg_long_id:
                is_demo = move.company_id.l10n_eg_edi_demo_mode
                base_url = self._l10n_eg_get_eta_qr_domain(is_demo=is_demo)
                qr_code_str = '%s/documents/%s/share/%s' % (base_url, move.l10n_eg_uuid, move.l10n_eg_long_id)
                move.l10n_eg_qr_code = qr_code_str
            else:
                move.l10n_eg_qr_code = ''

    @api.depends('l10n_eg_eta_submission_ids')
    def _compute_l10n_eg_edi_submission_details(self):
        for move in self:
            last_submission = move.l10n_eg_eta_submission_ids and move.l10n_eg_eta_submission_ids[-1]
            if last_submission:
                move.l10n_eg_edi_submission_state = last_submission.l10n_eg_eta_submission_state
                move.l10n_eg_long_id = last_submission.l10n_eg_eta_document_longid
            else:
                move.l10n_eg_edi_submission_state = False
                move.l10n_eg_long_id = False

    @api.depends('l10n_eg_eta_submission_ids')
    def _compute_l10n_eg_edi_uuid(self):
        for move in self:
            move.l10n_eg_uuid = (
                move.l10n_eg_eta_submission_ids
                and move.l10n_eg_eta_submission_ids[-1].l10n_eg_eta_document_uuid
                or False
            )

    def _get_fields_to_detach(self):
        fields_list = super()._get_fields_to_detach()
        fields_list.append('l10n_eg_eta_json_doc_file')
        return fields_list

    @api.depends('l10n_eg_eta_submission_ids')
    def _compute_show_reset_to_draft_button(self):
        moves_to_prevent_reset = self.filtered(
            lambda m: m.country_code == 'EG' and m.l10n_eg_edi_submission_state in ['rejected', 'test']
        )
        moves_to_prevent_reset.show_reset_to_draft_button = False
        super(AccountMove, self - moves_to_prevent_reset)._compute_show_reset_to_draft_button()

    def _need_cancel_request(self):
        # EXTENDS 'account'
        return super()._need_cancel_request() or self.l10n_eg_edi_submission_state in ['accepted', 'test']

    def button_request_cancel(self):
        # EXTENDS 'account'
        super().button_request_cancel()
        if self.country_code == 'EG' and self.l10n_eg_edi_submission_state in ['accepted', 'test']:
            return {
                'type': 'ir.actions.act_window',
                'name': self.env._("Cancel Invoice in ETA"),
                'res_model': 'l10n_eg_edi.cancel.wizard',
                'view_mode': 'form',
                'target': 'new',
                'context': {
                    'default_move_id': self.id,
                },
            }

    def action_get_l10n_eg_invoice_pdf(self):
        """ This is a pdf with the structure from the government.  While we can use our own format,
        some clients appreciate this to verify that all the data is there in case of confusion."""
        moves_failed_to_fetch = []
        for move in self:
            if move.country_code != 'EG' or move.l10n_eg_edi_submission_state != 'accepted' or move.state != 'posted':
                continue
            if not self._l10n_eg_get_eta_invoice_pdf():
                moves_failed_to_fetch.append(move.name)
        if moves_failed_to_fetch:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'message': self.env._("Failed to fetch PDF for the following invoices: %s", ", ".join(moves_failed_to_fetch)),
                    'type': 'danger',
                    'sticky': True,
                },
            }
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': self.env._("PDF invoices fetched successfully."),
                'type': 'success',
                'sticky': False,
            },
        }

    def _l10n_eg_edi_exchange_currency_rate(self):
        """ Calculate the rate based on the balance and amount_currency, so we recuperate the one used at the time"""
        self.ensure_one()
        from_currency = self.currency_id
        to_currency = self.company_id.currency_id
        if from_currency != to_currency and self.invoice_line_ids:
            first_product_line = self.invoice_line_ids.filtered(lambda line: line.display_type == "product")[:1]
            amount_currency = first_product_line.amount_currency
            if not float_is_zero(amount_currency, precision_rounding=from_currency.rounding):
                # The `balance` on an invoice line is a rounded value, calculated using the invoice_currency_rate.
                # To avoid rounding discrepancies, the rate is recalculated from this final rounded balance instead of
                # directly using invoice_currency_rate.
                return abs(first_product_line.balance / amount_currency)
        return 1.0

    def _l10n_eg_edi_round(self, amount, precision_digits=5):
        """
            This method is call for rounding.
            If anything is wrong with rounding then we quick fix in method
        """
        return json_float_round(amount, precision_digits)

    # ===================================================
    #   EDI Methods
    # ===================================================

    def _generate_l10n_eg_edi_json(self):
        self.ensure_one()
        AccountTax = self.env['account.tax']
        base_amls = self.line_ids.filtered(lambda x: x.display_type == 'product')
        base_lines = [self._prepare_product_base_line_for_taxes_computation(x) for x in base_amls]
        tax_amls = self.line_ids.filtered('tax_repartition_line_id')
        tax_lines = [self._prepare_tax_line_for_taxes_computation(x) for x in tax_amls]
        AccountTax._add_tax_details_in_base_lines(base_lines, self.company_id)
        AccountTax._round_base_lines_tax_details(base_lines, self.company_id, tax_lines=tax_lines)

        # Tax amounts per line.

        def grouping_function_base_line(base_line, tax_data):
            if not tax_data:
                return None
            tax = tax_data['tax']
            code_split = tax.l10n_eg_eta_code.split('_')
            return {
                'rate': abs(tax.amount) if tax.amount_type != 'fixed' else 0,
                'tax_type': code_split[0].upper(),
                'sub_type': code_split[1].upper(),
            }

        base_lines_aggregated_values = AccountTax._aggregate_base_lines_tax_details(base_lines, grouping_function_base_line)
        invoice_line_data, totals = self._l10n_eg_eta_prepare_invoice_lines_data(base_lines_aggregated_values)

        # Tax amounts for the whole document.

        def grouping_function_global(base_line, tax_data):
            if not tax_data:
                return None
            tax = tax_data['tax']
            code_split = tax.l10n_eg_eta_code.split('_')
            return {
                'tax_type': code_split[0].upper(),
            }

        def grouping_function_total_amount(base_line, tax_data):
            return True if tax_data else None

        base_lines_aggregated_values_total_amount = AccountTax._aggregate_base_lines_tax_details(base_lines, grouping_function_total_amount)
        values_per_grouping_key_total_amount = AccountTax._aggregate_base_lines_aggregated_values(base_lines_aggregated_values_total_amount)

        base_lines_aggregated_values = AccountTax._aggregate_base_lines_tax_details(base_lines, grouping_function_global)
        values_per_grouping_key = AccountTax._aggregate_base_lines_aggregated_values(base_lines_aggregated_values)

        date_string = self.invoice_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        eta_invoice = {
            'issuer': self._l10n_eg_eta_prepare_address_data(self.journal_id.l10n_eg_branch_id, issuer=True),
            'receiver': self._l10n_eg_eta_prepare_address_data(self.partner_id, self),
            'documentType': 'i' if self.move_type == 'out_invoice' else 'c' if self.move_type == 'out_refund' else 'd' if self.move_type == 'in_refund' else '',
            'documentTypeVersion': '1.0',
            'dateTimeIssued': date_string,
            'taxpayerActivityCode': self.journal_id.l10n_eg_activity_type_id.code,
            'internalID': self.name,
            'invoiceLines': invoice_line_data,
            'taxTotals': [
                {
                    'taxType': grouping_key['tax_type'],
                    'amount': self._l10n_eg_edi_round(abs(tax_values['tax_amount'])),
                }
                for grouping_key, tax_values in values_per_grouping_key.items()
                if grouping_key
            ],
            'totalDiscountAmount': self._l10n_eg_edi_round(totals['discount_total']),
            'totalSalesAmount': self._l10n_eg_edi_round(totals['total_price_subtotal_before_discount']),
            'netAmount': self._l10n_eg_edi_round(sum(x['base_amount'] for x in values_per_grouping_key_total_amount.values())),
            'totalAmount': self._l10n_eg_edi_round(sum(x['base_amount'] + x['tax_amount'] for x in values_per_grouping_key_total_amount.values())),
            'extraDiscountAmount': 0.0,
            'totalItemsDiscountAmount': 0.0,
        }
        if self.ref:
            eta_invoice['purchaseOrderReference'] = self.ref
        if self.invoice_origin:
            eta_invoice['salesOrderReference'] = self.invoice_origin
        return eta_invoice

    def _l10n_eg_eta_prepare_invoice_lines_data(self, base_lines_aggregated_values):
        lines = []
        totals = {
            'discount_total': 0.0,
            'total_price_subtotal_before_discount': 0.0,
        }
        for base_line, aggregated_values in base_lines_aggregated_values:
            line = base_line['record']
            tax_details = base_line['tax_details']
            price_unit = self._l10n_eg_edi_round(abs((line.balance / line.quantity) / (1 - (line.discount / 100.0)))) if line.quantity and line.discount != 100.0 else line.price_unit
            price_subtotal_before_discount = self._l10n_eg_edi_round(abs(line.balance / (1 - (line.discount / 100)))) if line.discount != 100.0 else self._l10n_eg_edi_round(price_unit * line.quantity)
            discount_amount = self._l10n_eg_edi_round(price_subtotal_before_discount - abs(line.balance))
            item_code = line.product_id.l10n_eg_eta_code or line.product_id.barcode
            lines.append({
                'description': line.name,
                'itemType': item_code.startswith('EG') and 'EGS' or 'GS1',
                'itemCode': item_code,
                'unitType': line.product_uom_id.l10n_eg_unit_code_id.code,
                'quantity': line.quantity,
                'internalCode': line.product_id.default_code or '',
                'valueDifference': 0.0,
                'totalTaxableFees': 0.0,
                'itemsDiscount': 0.0,
                'unitValue': {
                    'currencySold': self.currency_id.name,
                    'amountEGP': price_unit,
                },
                'discount': {
                    'rate': line.discount,
                    'amount': discount_amount,
                },
                'taxableItems': [
                    {
                        'taxType': grouping_key['tax_type'],
                        'amount': self._l10n_eg_edi_round(abs(tax_values['tax_amount'])),
                        'subType': grouping_key['sub_type'],
                        'rate': grouping_key['rate'],
                    }
                    for grouping_key, tax_values in aggregated_values.items()
                    if grouping_key
                ],
                'salesTotal': price_subtotal_before_discount,
                'netTotal': self._l10n_eg_edi_round(tax_details['total_excluded'] + tax_details['delta_total_excluded']),
                'total': self._l10n_eg_edi_round(tax_details['total_included']),
            })
            totals['discount_total'] += discount_amount
            totals['total_price_subtotal_before_discount'] += price_subtotal_before_discount
            if self.currency_id != self.env.ref('base.EGP'):
                lines[-1]['unitValue']['currencyExchangeRate'] = self._l10n_eg_edi_round(self._l10n_eg_edi_exchange_currency_rate())
                lines[-1]['unitValue']['amountSold'] = line.price_unit
        return lines, totals

    def _l10n_eg_eta_prepare_address_data(self, partner, issuer=False):
        address = {
            'address': {
                'country': partner.country_id.code,
                'governate': partner.state_id.name or '',
                'regionCity': partner.city or '',
                'street': ' '.join(s for s in [partner.street, partner.street2] if s),
                'buildingNumber': partner.l10n_eg_building_no or '',
                'postalCode': partner.zip or '',
            },
            'name': partner.name,
        }
        if issuer:
            address['address']['branchID'] = self.journal_id.l10n_eg_branch_identifier or ''
        individual_type = self._l10n_eg_get_partner_tax_type(partner, issuer)
        address['type'] = individual_type or ''
        if individual_type != 'P':
            address['id'] = partner.vat or ''
        return address

    def _l10n_eg_get_partner_tax_type(self, partner_id, issuer=False):
        if issuer:
            return 'B'
        if partner_id.commercial_partner_id.country_code == 'EG':
            return 'B' if partner_id.commercial_partner_id.is_company else 'P'
        return 'F'

    @api.model
    def _l10n_eg_eta_send_invoice(self, invoices_json):
        invoices = self.env['account.move'].browse(list(invoices_json.keys()))
        company = invoices.company_id
        access_data = self._l10n_eg_eta_get_access_token(company)
        if access_data.get('error'):
            return access_data
        request_url = '/api/v1.0/documentsubmissions'
        body = json.dumps(
            {'documents': [inv['invoice'] for inv in invoices_json.values()]},
            ensure_ascii=False,
            indent=4
        ).encode('utf-8')
        headers = self._l10n_eg_edi_prepare_headers(access_data.get('access_token'))
        response = self._l10n_eg_edi_eta_request(
            url=request_url,
            method='POST',
            params=body,
            headers=headers,
            is_demo=company.l10n_eg_edi_demo_mode
        )
        if (data := response['data']) and data.get('error'):
            return response['data']
        accepted_docs = data.get('acceptedDocuments', [])
        rejected_docs = data.get('rejectedDocuments', [])
        for invoice in invoices:
            if accepted_inv := next((doc for doc in accepted_docs if doc.get('internalId') == invoice.name), False):
                invoice._l10n_eg_log_and_create_attachment(accepted_inv, invoices_json.get(invoice.id), success=True)
            elif rejected_inv := next((doc for doc in rejected_docs if doc.get('internalId') == invoice.name), False):
                invoice._l10n_eg_log_and_create_attachment(rejected_inv, invoices_json.get(invoice.id), success=False)

    def _l10n_eg_log_and_create_attachment(self, response, request, success):
        request_data = request['invoice']
        attachment = self.env['ir.attachment'].create({
            'name': _('ETA_INVOICE_DOC_%s', self.name),
            'res_id': self.id,
            'res_model': self._name,
            'res_field': 'l10n_eg_eta_json_doc_file',
            'type': 'binary',
            'raw': json.dumps({'request': request_data, 'response': response}).encode(),
            'mimetype': 'application/json',
            'description': _('Egyptian Tax authority JSON invoice generated for %s.', self.name),
        })
        submission_values = {
            'move_id': self.id,
            'l10n_eg_eta_submission_date': fields.Datetime.now(),
            'l10n_eg_eta_submission_id': response['data'].get('submissionID'),
            'l10n_eg_eta_json_filename': attachment.name,
        }
        if not success:
            response_message = self.env._("""
                    Error Code: %s\n
                    Error Message: %s\n
                    Details: %s
                """,
                response['error']['code'],
                response['error']['message'],
                response['error'].get('details', ''),
            )
            submission_values.update({
                'l10n_eg_eta_submission_state': 'rejected',
                'l10n_eg_eta_response_message': response_message,
            })
        elif accepted_doc := response.get('acceptedDocuments'):
            submission_values.update({
                'l10n_eg_eta_submission_state': 'test' if self.company_id.l10n_eg_edi_demo_mode else 'accepted',
                'l10n_eg_eta_response_message': self.env._('Document accepted by ETA'),
                'l10n_eg_eta_document_uuid': accepted_doc[0].get('uuid'),
            })
        self.invalidate_recordset(fnames=['l10n_eg_eta_json_doc_file'])
        self.env['l10n_eg_edi.eta.submission'].create([submission_values])

    def _l10n_eg_get_eta_invoice_pdf(self):
        """This method fetches the PDF Invoice as per the format set by ETA."""
        self.ensure_one()
        access_data = self._l10n_eg_eta_get_access_token(self.company_id)
        if access_data.get('error'):
            return False
        headers = self._l10n_eg_edi_prepare_headers(access_data.get('access_token'))
        request_url = f'/api/v1.0/documents/{self.l10n_eg_uuid}/pdf'
        response = self._l10n_eg_edi_eta_request(
            url=request_url,
            method='GET',
            params=None,
            headers=headers,
            is_demo=self.company_id.l10n_eg_edi_demo_mode,
        )
        if response['data'].get('error') or not response['response'].ok:
            return False
        pdf_content = response['response'].content
        attachment = self.env['ir.attachment'].create({
            'name': _('ETA_INVOICE_PDF_%s', self.name),
            'res_id': self.id,
            'res_model': self._name,
            'type': 'binary',
            'raw': base64.b64encode(pdf_content),
            'mimetype': 'application/pdf',
            'description': self.env._("Egyptian Tax authority PDF invoice generated for %s.", self.name),
        })
        self.message_post(
            body=self.env._("PDF Invoice fetched successfully from ETA."),
            attachment_ids=attachment.ids,
        )
        return True

    # ===================================================
    # EDI API Methods
    # ===================================================

    @api.model
    def _l10n_eg_get_eta_qr_domain(self, is_demo=False):
        return is_demo and ETA_DOMAINS['invoice.demo'] or ETA_DOMAINS['invoice.production']

    @api.model
    def _l10n_eg_get_eta_api_domain(self, is_demo=False):
        return is_demo and ETA_DOMAINS['demo'] or ETA_DOMAINS['production']

    @api.model
    def _l10n_eg_get_eta_token_domain(self, is_demo=False):
        return is_demo and ETA_DOMAINS['token.demo'] or ETA_DOMAINS['token.production']

    @api.model
    def _l10n_eg_edi_prepare_headers(self, bearer_token):
        return {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {bearer_token}',
        }

    @api.model
    def _l10n_eg_edi_eta_request(self, url, method, params, headers, is_demo, is_access_token_req=False, timeout=20):
        api_domain = is_access_token_req and self._l10n_eg_get_eta_token_domain(is_demo) or self._l10n_eg_get_eta_api_domain(is_demo)
        request_url = api_domain + url
        try:
            session = requests.session()
            session.mount("https://", LegacyHTTPAdapter())
            response = session.request(method, request_url, data=params, headers=headers, timeout=timeout)
        except requests.exceptions.MissingSchema:
            return self._l10n_eg_parse_error(message=self.env._("Invalid URL schema. Please check the URL and try again."))
        except requests.exceptions.ConnectionError:
            return self._l10n_eg_parse_error(message=self.env._("Failed to connect to ETA. Please try again later."))
        except requests.exceptions.Timeout:
            return self._l10n_eg_parse_error(message=self.env._("Request to ETA timed out. Please try again later."))

        try:
            response_data = response.json()
        except JSONDecodeError:
            response_data = {}

        return {'data': response_data, 'response': response}

    def _l10n_eg_eta_get_access_token(self, company):
        user = company.l10n_eg_client_identifier
        secret = company.l10n_eg_client_secret
        access = '%s:%s' % (user, secret)
        user_and_pass = base64.b64encode(access.encode()).decode()
        request_url = '/connect/token'
        headers = {'Authorization': f'Basic {user_and_pass}'}
        body = {'grant_type': 'client_credentials'}
        response_data = self._l10n_eg_edi_eta_request(
            url=request_url,
            method='POST',
            params=body,
            headers=headers,
            is_demo=company.l10n_eg_edi_demo_mode,
            is_access_token_req=True)
        if response_data['data'].get('error'):
            return response_data
        return {'access_token': response_data.get('data').get('access_token')}

    @api.model
    def _l10n_eg_parse_error(self, message):
        return {
            'error': {
                'code': '000',
                'message': message,
            },
        }
