# Part of Odoo. See LICENSE file for full copyright and licensing details.
import json
import requests

from json import JSONDecodeError
from odoo import api, models, fields, _
from odoo.exceptions import UserError
from odoo.tools import float_is_zero, float_compare, BinaryBytes
from odoo.tools.float_utils import json_float_round
from odoo.addons.account.tools import LegacyHTTPAdapter
from odoo.addons.l10n_eg_edi_eta.models.eta_submission import ETA_SUBMISSION_STATES


ETA_INVOICE_SENDING_BATCH_SIZE = 10

ETA_DOMAINS = {
    'demo': 'https://api.preprod.invoicing.eta.gov.eg',
    'production': 'https://api.invoicing.eta.gov.eg',
    'invoice.demo': 'https://preprod.invoicing.eta.gov.eg/',
    'invoice.production': 'https://invoicing.eta.gov.eg',
    'token.demo': 'https://id.preprod.eta.gov.eg',
    'token.production': 'https://id.eta.gov.eg',
}

ETA_INVOICE_SUBMISSION_STATES = ETA_SUBMISSION_STATES + [('to_send', 'To Send')]

ETA_DUMMY_SUBMISSION_ID = "TZRKK8MFZ CPSTW9XC YWBMKME10A BC123160 2681697"

ETA_INVOICE_DUMMY_RESPONSE = {
    'uuid': 'TZRKK8MFZCPSTW9XCYWBMKME11',
    'longId': 'TZRKK8MFZ CPSTW9XC YWBMKME10A BC123160 2681697',
}


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_eg_long_id = fields.Char(string='ETA Long ID', compute='_compute_l10n_eg_long_id')
    l10n_eg_qr_code = fields.Char(string='ETA QR Code', compute='_compute_eta_qr_code_str')
    l10n_eg_uuid = fields.Char(
        string='Document UUID',
        compute='_compute_l10n_eg_edi_uuid',
        store=True,
        copy=False,
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
    l10n_eg_edi_api_mode = fields.Selection(related='company_id.l10n_eg_edi_api_mode', string='ETA Mode')
    l10n_eg_edi_submission_state = fields.Selection(
        selection=ETA_INVOICE_SUBMISSION_STATES,
        string="ETA State",
        compute='_compute_l10n_eg_edi_submission_values',
        store=True,
    )
    l10n_eg_edi_error_message = fields.Char(
        string="ETA Error",
        compute='_compute_l10n_eg_edi_submission_values',
        store=True,
    )
    l10n_eg_signing_time = fields.Datetime(string='ETA Signing Time', copy=False)

    @api.depends('l10n_eg_uuid', 'l10n_eg_long_id')
    def _compute_eta_qr_code_str(self):
        for move in self:
            if move.l10n_eg_uuid and move.l10n_eg_long_id and move.l10n_eg_edi_api_mode != 'demo':
                is_production = move.l10n_eg_edi_api_mode == 'production'
                base_url = self._l10n_eg_get_eta_qr_domain(is_production=is_production)
                qr_code_str = '%s/documents/%s/share/%s' % (base_url, move.l10n_eg_uuid, move.l10n_eg_long_id)
                move.l10n_eg_qr_code = qr_code_str
            else:
                move.l10n_eg_qr_code = ''

    @api.depends('l10n_eg_eta_submission_ids')
    def _compute_l10n_eg_long_id(self):
        for move in self:
            last_submission = move.l10n_eg_eta_submission_ids and move.l10n_eg_eta_submission_ids[-1]
            if last_submission:
                move.l10n_eg_long_id = last_submission.l10n_eg_eta_document_longid
            else:
                move.l10n_eg_long_id = False

    @api.depends('l10n_eg_eta_submission_ids', 'state')
    def _compute_l10n_eg_edi_submission_values(self):
        for move in self:
            last_submission = move.l10n_eg_eta_submission_ids and move.l10n_eg_eta_submission_ids[-1]
            if last_submission:
                move.l10n_eg_edi_submission_state = last_submission.l10n_eg_eta_submission_state
                move.l10n_eg_edi_error_message = last_submission.l10n_eg_eta_error_message
            else:
                move.l10n_eg_edi_submission_state = move.state == 'posted' and 'to_send' or False
                move.l10n_eg_edi_error_message = ''

    @api.depends('l10n_eg_eta_submission_ids')
    def _compute_l10n_eg_edi_uuid(self):
        for move in self:
            move.l10n_eg_uuid = (
                move.l10n_eg_eta_submission_ids
                and move.l10n_eg_eta_submission_ids[-1].l10n_eg_eta_document_uuid
                or False
            )

    @api.depends('l10n_eg_eta_submission_ids')
    def _compute_show_reset_to_draft_button(self):
        moves_to_prevent_reset = self.filtered(
            lambda m: m.country_code == 'EG' and m.l10n_eg_edi_submission_state and m.l10n_eg_edi_submission_state != 'to_send'
        )
        moves_to_prevent_reset.show_reset_to_draft_button = False
        super(AccountMove, self - moves_to_prevent_reset)._compute_show_reset_to_draft_button()

    def button_request_cancel(self):
        # EXTENDS 'account'
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
        return super().button_request_cancel()

    def action_get_l10n_eg_invoice_pdf(self):
        """ This is a pdf with the structure from the government.  While we can use our own format,
        some clients appreciate this to verify that all the data is there in case of confusion."""
        moves_failed_to_fetch = self.env['account.move']
        eg_moves = self.filtered(
            lambda m: m.country_code == 'EG' and m.l10n_eg_edi_submission_state in ['accepted', 'test'] and m.state == 'posted'
        )
        if eg_moves.company_id.filtered(lambda c: c.l10n_eg_edi_api_mode == 'demo'):
            raise UserError(self.env._("Cannot fetch PDF if the invoice company's ETA API mode is in Demo."))
        for move in eg_moves:
            if not move._l10n_eg_get_eta_invoice_pdf():
                moves_failed_to_fetch |= move

        action_to_return = {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': self.env._("""
                    PDF invoices fetched successfully. If the invoices are sent to ETA, the PDF will be attached to the invoice.
                """),
                'type': 'info',
                'sticky': True,
            },
        }
        if moves_failed_to_fetch:
            action_to_return['params'].update(
                {'next': moves_failed_to_fetch._get_records_action(views=[(False, 'list')])}
            )
        return action_to_return

    def action_sign_invoices(self):
        attachments_to_create = []
        invoices_to_sign = {}
        for move in self:
            einvoice_json = move._generate_l10n_eg_edi_json()
            if not move.l10n_eg_eta_json_doc_file:
                attachments_to_create.append({
                    'name': _('ETA_INVOICE_DOC_%s', move.name),
                    'res_id': move.id,
                    'res_model': move._name,
                    'res_field': 'l10n_eg_eta_json_doc_file',
                    'raw': json.dumps({'request': einvoice_json}).encode(),
                    'mimetype': 'application/json',
                })
            else:
                move.l10n_eg_eta_json_doc_file = BinaryBytes(json.dumps({'request': einvoice_json}).encode())
            move.l10n_eg_signing_time = fields.Datetime.now()
            invoices_to_sign[move.id] = {'invoice': einvoice_json, 'signing_time': move.l10n_eg_signing_time}

        if attachments_to_create:
            self.env['ir.attachment'].create(attachments_to_create)

        thumb_drive = self.env['l10n_eg_edi.thumb.drive'].search(
            [('user_id', '=', self.env.user.id), ('company_id', '=', self.company_id[0].id)]
        )
        return thumb_drive.action_sign_invoices(invoices_to_sign)

    def _get_fields_to_detach(self):
        fields_list = super()._get_fields_to_detach()
        fields_list.append('l10n_eg_eta_json_doc_file')
        return fields_list

    def _need_cancel_request(self):
        # EXTENDS 'account'
        return super()._need_cancel_request() or self.l10n_eg_edi_submission_state in ['accepted', 'test']

    # ===================================================
    #   EDI Helper Methods
    # ===================================================

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

    def _is_l10n_eg_edi_applicable(self, mode):
        return (
            self.company_id.l10n_eg_edi_api_mode == mode
            and self.country_code == 'EG'
            and self.state == 'posted'
            and self.l10n_eg_edi_submission_state in ['to_send', 'rejected']
        )

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
            'receiver': self._l10n_eg_eta_prepare_address_data(self.partner_id),
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
            has_full_line_discount = float_compare(line.discount, 100.00, precision_digits=2)
            price_unit = (
                (line.quantity and has_full_line_discount)
                and self._l10n_eg_edi_round(abs((line.balance / line.quantity) / (1 - (line.discount / 100.0))))
                or line.price_unit
            )
            price_subtotal_before_discount = (
                has_full_line_discount
                and self._l10n_eg_edi_round(abs(line.balance / (1 - (line.discount / 100))))
                or self._l10n_eg_edi_round(price_unit * line.quantity)
            )
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

    def _l10n_eg_edi_send_invoices_in_batch(self):
        """Send multiple invoices to ETA in a fix batch size and process their responses."""
        for i in range(0, len(self.ids), ETA_INVOICE_SENDING_BATCH_SIZE):
            batch = self[i:i + ETA_INVOICE_SENDING_BATCH_SIZE]
            if error := batch._l10n_eg_eta_send_invoice():
                return error

    def _l10n_eg_eta_send_invoice(self):
        access_data = self._l10n_eg_eta_get_access_token()
        if access_data.get('error'):
            return access_data
        request_url = '/api/v1.0/documentsubmissions'
        request_invoices = {
            inv.id: json.loads(inv.l10n_eg_eta_json_doc_file.content)['request']
            for inv in self
        }
        body = json.dumps(
            {'documents': list(request_invoices.values())},
            ensure_ascii=False,
            indent=4
        ).encode('utf-8')
        headers = self._l10n_eg_edi_prepare_headers(access_data.get('access_token'))
        _response, data = self._l10n_eg_edi_eta_request(
            url=request_url,
            method='POST',
            body=body,
            headers=headers,
        )
        if data.get('error'):
            return data
        submission_id = data.get('submissionId')
        accepted_docs = data.get('acceptedDocuments', [])
        rejected_docs = data.get('rejectedDocuments', [])
        for invoice in self:
            if accepted_inv := next((doc for doc in accepted_docs if doc.get('internalId') == invoice.name), None):
                invoice._l10n_eg_log_and_update_attachment(accepted_inv, submission_id, success=True)
            elif rejected_inv := next((doc for doc in rejected_docs if doc.get('internalId') == invoice.name), None):
                invoice._l10n_eg_log_and_update_attachment(rejected_inv, submission_id, success=False)

    def _l10n_eg_log_and_update_attachment(self, response, submission_id, success):
        """Log the response from ETA and update the attachment with the submission details."""
        attachment = self.env['ir.attachment'].search([
            ('res_model', '=', self._name),
            ('res_id', '=', self.id),
            ('res_field', '=', 'l10n_eg_eta_json_doc_file'),
        ], limit=1)
        submission_values = {
            'move_id': self.id,
            'l10n_eg_eta_submission_date': fields.Datetime.now(),
            'l10n_eg_eta_submission_id': submission_id,
            'l10n_eg_eta_json_filename': attachment.name,
        }
        if not success:
            response_message = self.env._("""
                    Error Code: %(code)s\n
                    Error Message: %s(message)\n
                    Details: %(details)s
                """,
                code=response['error']['code'],
                message=response['error']['message'],
                details=response['error'].get('details', ''),
            )
            submission_values.update({
                'l10n_eg_eta_submission_state': 'rejected',
                'l10n_eg_eta_error_message': response_message,
            })
            self.l10n_eg_edi_submission_state = 'rejected'
        else:
            submission_values.update({
                'l10n_eg_eta_submission_state': 'test' if self.company_id.l10n_eg_edi_api_mode != 'production' else 'accepted',
                'l10n_eg_eta_document_uuid': response.get('uuid'),
                'l10n_eg_eta_document_longid': response.get('longId'),
            })
            self.l10n_eg_edi_submission_state = 'test' if self.company_id.l10n_eg_edi_api_mode != 'production' else 'accepted'

        invoice_json = json.loads(self.l10n_eg_eta_json_doc_file.content)
        invoice_json['response'] = response
        self.l10n_eg_eta_json_doc_file = BinaryBytes(json.dumps(invoice_json).encode())
        self.invalidate_recordset(fnames=['l10n_eg_eta_json_doc_file'])
        self.env['l10n_eg_edi.eta.submission'].create([submission_values])

    def _l10n_eg_get_eta_invoice_pdf(self):
        """This method fetches the PDF Invoice as per the format set by ETA."""
        self.ensure_one()
        access_data = self._l10n_eg_eta_get_access_token()
        if access_data.get('error'):
            return False
        headers = self._l10n_eg_edi_prepare_headers(access_data.get('access_token'))
        request_url = f'/api/v1.0/documents/{self.l10n_eg_uuid}/pdf'
        response, data = self._l10n_eg_edi_eta_request(
            url=request_url,
            method='GET',
            body=None,
            headers=headers,
        )
        if data.get('error') or not response or not response.ok:
            return False
        pdf_content = response['response'].content
        attachment = self.env['ir.attachment'].create({
            'name': _('ETA_INVOICE_PDF_%s', self.name),
            'res_id': self.id,
            'res_model': self._name,
            'type': 'binary',
            'raw': pdf_content,
            'mimetype': 'application/pdf',
            'description': self.env._("Egyptian Tax authority PDF invoice generated for %s.", self.name),
        })
        self.message_post(
            body=self.env._("PDF Invoice fetched successfully from ETA."),
            attachment_ids=attachment.ids,
        )
        return True

    def _l10n_eg_edi_cancel_invoice(self, cancel_reason):
        if self.l10n_eg_edi_api_mode == 'demo':
            self._l10n_eg_edi_log_on_cancel(cancel_reason)
            return

        access_data = self._l10n_eg_eta_get_access_token()
        if error := access_data.get('error'):
            raise UserError(self.env._(
                "Error occured while fetching access token: [%(code)s] %(message)s",
                code=error.get('code'),
                message=error.get('message'),
            ))
        if self.l10n_eg_edi_submission_state == 'cancel':
            raise UserError(self.env._("Cannot cancel an invoice which is already cancelled !"))

        headers = self._l10n_eg_edi_prepare_headers(access_data.get('access_token'))
        body = json.dumps({'status': 'cancelled', 'reason': cancel_reason}).encode()
        request_url = f'/api/v1.0/documents/state/{self.l10n_eg_uuid}/state'
        response, data = self._l10n_eg_edi_eta_request(
            url=request_url,
            method='PUT',
            headers=headers,
            body=body,
        )
        if data.get('error') and (not response or not response.ok):
            error = data.get('error', {})
            raise UserError(self.env._(
                "Error occured when trying to cancel invoice: [%(code)s] %(message)s",
                code=error.get('code'),
                message=error.get('message')
            ))
        # Create log for document cancellation.
        self._l10n_eg_edi_log_on_cancel(cancel_reason)

    def _l10n_eg_edi_log_on_cancel(self, cancel_reason):
        self.env['l10n_eg_edi.eta.submission'].create({
            'move_id': self.id,
            'l10n_eg_eta_submission_state': 'cancel',
            'l10n_eg_eta_submission_date': fields.Datetime.now(),
            'l10n_eg_eta_error_message': self.env._('Document cancelled on ETA\nCancel reason: %s', cancel_reason),
        })

    def _l10n_eg_edi_simulate_send_invoices(self):
        for move in self:
            einvoice_json = move._generate_l10n_eg_edi_json()
            self.env['ir.attachment'].create({
                'name': _('ETA_INVOICE_DOC_%s', move.name),
                'res_id': move.id,
                'res_model': move._name,
                'res_field': 'l10n_eg_eta_json_doc_file',
                'raw': json.dumps({'request': einvoice_json}).encode(),
                'mimetype': 'application/json',
            })
            move._l10n_eg_log_and_update_attachment(ETA_INVOICE_DUMMY_RESPONSE, ETA_DUMMY_SUBMISSION_ID, success=True)

    # ===================================================
    # EDI API Methods
    # ===================================================

    @api.model
    def _l10n_eg_get_eta_qr_domain(self, is_production=True):
        return is_production and ETA_DOMAINS['invoice.production'] or ETA_DOMAINS['invoice.demo']

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

    def _l10n_eg_edi_eta_request(self, url, method, body, headers, is_access_token_req=False, timeout=20):
        is_demo = self.company_id.l10n_eg_edi_api_mode == 'preproduction'
        api_domain = is_access_token_req and self._l10n_eg_get_eta_token_domain(is_demo) or self._l10n_eg_get_eta_api_domain(is_demo)
        request_url = api_domain + url
        try:
            session = requests.session()
            session.mount("https://", LegacyHTTPAdapter())
            response = session.request(method, request_url, data=body, headers=headers, timeout=timeout)
        except requests.exceptions.MissingSchema:
            return False, self._l10n_eg_parse_error(message=self.env._("Invalid URL schema. Please check the URL and try again.")),
        except requests.exceptions.ConnectionError:
            return False, self._l10n_eg_parse_error(message=self.env._("Failed to connect to ETA. Please try again later.")),
        except requests.exceptions.Timeout:
            return False, self._l10n_eg_parse_error(message=self.env._("Request to ETA timed out. Please try again later.")),

        try:
            response_data = response.json()
        except JSONDecodeError:
            response_data = {}
        return response, response_data

    def _l10n_eg_eta_get_access_token(self):
        user = self.company_id.sudo().l10n_eg_client_identifier
        secret = self.company_id.sudo().l10n_eg_client_secret
        request_url = '/connect/token'
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        body = {'grant_type': 'client_credentials', 'client_id': user, 'client_secret': secret}
        _response, data = self._l10n_eg_edi_eta_request(
            url=request_url,
            method='POST',
            body=body,
            headers=headers,
            is_access_token_req=True
        )
        if data.get('error'):
            return data
        return {'access_token': data.get('access_token')}

    @api.model
    def _l10n_eg_parse_error(self, message):
        return {
            'error': {
                'code': '000',
                'message': message,
            },
        }
