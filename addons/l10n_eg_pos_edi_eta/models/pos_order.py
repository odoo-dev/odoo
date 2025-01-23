import json
from hashlib import sha256

from odoo import _, api, fields, models
from odoo.addons.l10n_eg_edi_eta.models.account_edi_format import ETA_DOMAINS
from odoo.exceptions import UserError, ValidationError
from odoo.tools import float_is_zero


class PosOrder(models.Model):
    _inherit = 'pos.order'

    country_code = fields.Char(related='company_id.country_id.code')

    l10n_eg_pos_uuid = fields.Char(
        string="Document UUID",
        store=True,
        copy=False,
        compute='_compute_l10n_eg_eta_compute_pos_response_data'
    )
    l10n_eg_pos_qrcode = fields.Char(
        string="QR Code",
        compute='_compute_l10n_eg_pos_compute_qrcode'
    )
    l10n_eg_pos_eta_error = fields.Text(string="EDI Error")
    l10n_eg_pos_eta_state = fields.Selection(
        [
            ('ignore', "Ignored"),
            ('pending', "Pending"),
            ('sent', "Sent")
        ],
        string="EDI State",
        default='ignore'
    )
    l10n_eg_pos_json_doc_id = fields.Many2one(
        comodel_name='ir.attachment',
        copy=False
    )
    l10n_eg_pos_submission_number = fields.Char(
        string="Submission ID",
        copy=False,
        store=True,
        compute='_compute_l10n_eg_eta_compute_pos_response_data'
    )
    l10n_eg_pos_eta_submission_state = fields.Selection(
        [
            ('pending', "Pending"),
            ('valid', "Valid"),
            ('invalid', "Invalid")
        ],
        string="EDI Validity",
        default='pending'
    )
    l10n_eg_pos_eta_submission_errors = fields.Text(string="EDI Submission Errors")

    @api.depends('company_id.l10n_eg_production_env', 'date_order', 'l10n_eg_pos_uuid')
    def _compute_l10n_eg_pos_compute_qrcode(self):
        """
            Compute the QR code string used to render the QR code on the receipt.
            :return: QR Code string
            :rtype: str
        """
        api_domain = self.env.company.l10n_eg_production_env and ETA_DOMAINS['production'] or ETA_DOMAINS[
            'preproduction']
        for order in self:
            order.l10n_eg_pos_qrcode = ''
            if order.l10n_eg_pos_uuid:
                order.l10n_eg_pos_qrcode = "%s/receipts/search/%s/share/%s" % (api_domain, order.l10n_eg_pos_uuid, order.date_order.strftime('%Y-%m-%dT%H:%M:%SZ'))

    @api.depends('l10n_eg_pos_json_doc_id.raw')
    def _compute_l10n_eg_eta_compute_pos_response_data(self):
        for rec in self:
            response_data = rec.l10n_eg_pos_json_doc_id and json.loads(rec.l10n_eg_pos_json_doc_id.raw).get('response')
            if response_data:
                rec.l10n_eg_pos_uuid = response_data.get('l10n_eg_pos_uuid')
                rec.l10n_eg_pos_submission_number = response_data.get('l10n_eg_pos_submission_number')
            else:
                rec.l10n_eg_pos_uuid = False
                rec.l10n_eg_pos_submission_number = False

    @api.model
    def _l10n_eg_pos_eta_edi_document_format(self):
        l10n_eg_edi = self.env.ref('l10n_eg_edi_eta.edi_eg_eta', raise_if_not_found=False)
        if not l10n_eg_edi:
            raise ValidationError(_("The Egyptian EDI is not available, kindly check with your friendly administrator "
                                    "or update Egyptian E-Invoice Integration Module."))
        return l10n_eg_edi

    @api.model
    def _l10n_eg_edi_round(self, amount, precision_digits=5):
        return self._l10n_eg_pos_eta_edi_document_format()._l10n_eg_edi_round(amount, precision_digits)

    @api.model
    def _l10n_eg_get_partner_tax_type(self, partner_id, issuer=False):
        return self._l10n_eg_pos_eta_edi_document_format()._l10n_eg_get_partner_tax_type(partner_id, issuer)

    @api.model
    def _l10n_eg_eta_connect_to_server(self, request_data, request_url, method, is_access_token_req=False, production_enviroment=False):
        return self._l10n_eg_pos_eta_edi_document_format()._l10n_eg_eta_connect_to_server(
            request_data, request_url,
            method, is_access_token_req,
            production_enviroment,
        )

    def _l10n_eg_pos_eta_exchange_currency_rate(self):
        """
            Calculate the rate based on the balance and amount_currency, so we recuperate the one used at the
            time of the order
            :return: exchange rate
            :rtype: float
        """
        self.ensure_one()
        from_currency = self.currency_id
        to_currency = self.company_id.currency_id
        if from_currency == to_currency or not self.lines or float_is_zero(self.amount_total, precision_rounding=self.currency_id.rounding):
            return 1.0
        conversion_date = self.date_order or fields.Date.context_today(self)
        amount_currency = from_currency._convert(
            self.amount_total, to_currency, self.company_id, conversion_date
        )
        return abs(self.amount_total / amount_currency)

    def _l10n_eg_pos_get_eta_pos_code(self):
        """
            Get the ETA payment method code for the payment methods selected on the order
            :return: ETA payment method code
            :rtype: str
        """
        self.ensure_one()
        return self.payment_ids.payment_method_id.l10n_eg_pos_eta_code

    def _l10n_eg_pos_eta_get_previous_receipt(self):
        """
            Search for the previous receipt relating to the current record
            :return: Previous receipt record
            :rtype: recordset
        """
        self.ensure_one()
        return self.search([
            ('id', '!=', self.id),
            ('l10n_eg_pos_eta_state', '=', 'sent'),
            ('config_id', '=', self.config_id.id)
        ], limit=1, order='date_order desc')

    @api.model
    def _l10n_eg_pos_eta_get_signatures(self):
        """
            Return a list of signature dicts. For eReceipts, at least one signature is required, where
            signatureType == 'I' and the value can be an empty string
            :return: Signatures
            :rtype: list
        """
        return [{
            'signatureType': 'I',
            'value': '',
        }]

    def _l10n_eg_pos_eta_prepare_receipt_header(self, old_uuid=False):
        """
            Return the header dict required for the receipts.
            :return: receipt header
            :rtype: dict
        """
        self.ensure_one()
        header_dict = {
            'dateTimeIssued': self.date_order.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'receiptNumber': self.pos_reference,
            'uuid': '',
            'previousUUID': self._l10n_eg_pos_eta_get_previous_receipt().l10n_eg_pos_uuid or '',
            'currency': self.currency_id.name,
            'exchangeRate': 0 if self.country_code == 'EG' else self._l10n_eg_edi_round(self._l10n_eg_pos_eta_exchange_currency_rate()),
            'sOrderNameCode': self.name,
            'orderdeliveryMode': 'FC',
            'grossWeight': 0.0,
            'netWeight': 0.0,
        }
        if old_uuid:
            header_dict['referenceUUID'] = old_uuid
        return header_dict

    def _l10n_eg_pos_eta_prepare_receipt_tax_data(self, subtotal):
        tax_ids = self.lines.tax_ids_after_fiscal_position
        return [{
            'taxType': tax._get_l10n_eg_eta_code_types()[0],
            'amount': self._l10n_eg_edi_round(abs(tax.amount / 100.0) * subtotal),
        } for tax in tax_ids if tax.l10n_eg_eta_code]

    def _l10n_eg_pos_eta_prepare_receipt_item_data(self):
        """
            Prepare the receipt lines for the eReceipt submission, as well as a totals dict to be used in other
            parts of the reciept
            :return:  lines, totals dict
            :rtype: tuple(list, dict)
        """
        def calculate_undiscounted_line_amount(discounted_amount, discount_percent):
            return self._l10n_eg_edi_round(discounted_amount / (1 - (discount_percent / 100.0)))
        self.ensure_one()
        lines = []
        totals = {
            'total': 0.0,
            'total_net': 0.0,
            'discount_total': 0.0,
            'total_price_subtotal_before_discount': 0.0,
        }
        for line in self.lines:
            if not line.price_subtotal:
                continue
            price_unit = calculate_undiscounted_line_amount(line.price_subtotal / line.qty, line.discount) if line.qty and line.discount != 100 else line.price_unit
            price_subtotal_before_discount = calculate_undiscounted_line_amount(line.price_subtotal, line.discount) if line.qty and line.discount != 100 else price_unit * line.qty
            price_total_before_discount = self._l10n_eg_edi_round(line.price_subtotal_incl)
            discount_amount = self._l10n_eg_edi_round(price_subtotal_before_discount - line.price_subtotal)
            item_code = line.product_id.l10n_eg_eta_code or line.product_id.barcode
            lines.append({
                'internalCode': line.product_id.default_code or 'N/A',
                'description': line.name,
                'itemType': item_code.startswith('EG') and 'EGS' or 'GS1',
                'itemCode': item_code,
                'unitType': line.product_uom_id.l10n_eg_unit_code_id.code,
                'quantity': abs(line.qty),
                'unitPrice': abs(price_unit),
                'netSale': self._l10n_eg_edi_round(abs(line.price_subtotal)),
                'totalSale': abs(price_subtotal_before_discount),
                'total': price_total_before_discount,
                'commercialDiscountData': [{
                    'amount': self._l10n_eg_edi_round(abs(discount_amount)),
                    'description': _("Discount: %(discount_amount)s", abs(discount_amount))
                }],
                'taxableItems': [{
                    'taxType': tax._get_l10n_eg_eta_code_types()[0],
                    'amount': abs(self._l10n_eg_edi_round((tax.amount / 100.0) * line.price_subtotal)),
                    'subType': tax._get_l10n_eg_eta_code_types()[1],
                    'rate': abs(tax.amount),
                } for tax in line.tax_ids_after_fiscal_position if tax.l10n_eg_eta_code]
            })
            totals['total'] += price_total_before_discount
            totals['total_net'] += abs(self._l10n_eg_edi_round(line.price_subtotal))
            totals['discount_total'] += discount_amount
            totals['total_price_subtotal_before_discount'] += abs(price_subtotal_before_discount)
        return lines, totals

    @api.model
    def _l10n_eg_validate_threshold_exceeded(self, amount_total, threshold_amount):
        return amount_total >= (threshold_amount or float("inf"))

    def _l10n_eg_pos_eta_prepare_receipt_buyer(self):
        """
            Return the receipt buyer dict required for the receipts
            :return: receipt buyer
            :rtype: dict
        """
        self.ensure_one()
        partner_type = self._l10n_eg_get_partner_tax_type(self.partner_id)
        buyer_dict = {'type': partner_type, 'paymentNumber': ''}
        threshold_exceeded = self._l10n_eg_validate_threshold_exceeded(
            self.amount_total,
            self.company_id.l10n_eg_invoicing_threshold
        )
        if (threshold_exceeded and partner_type == 'P') or partner_type == 'B':
            buyer_dict.update({
                'id': self.partner_id.vat or '',
                'name': self.partner_id.name
            })
        return buyer_dict

    def _l10n_eg_pos_eta_serialize_receipt_json(self, receipt):
        """
            Serialize the receipt in order to use it for UUID generation
            :param receipt: receipt dict to be used for serialization
            :return: Serialized receipt string
            :rtype: str
        """

        def _format_key(k, do_upper=True):
            res = json.dumps(str(k), ensure_ascii=False)
            return res.upper() if do_upper else res

        if not isinstance(receipt, dict):
            return _format_key(receipt, False)

        document_string = ''
        for key, value in receipt.items():
            if isinstance(value, list):
                for item in value:
                    document_string += _format_key(key)
                    document_string += self._l10n_eg_pos_eta_serialize_receipt_json(item)
            else:
                document_string += _format_key(key)
                document_string += self._l10n_eg_pos_eta_serialize_receipt_json(value)
        return document_string

    @api.model
    def _l10n_eg_pos_eta_get_receipt_uuid(self, receipt):
        """
            Generate the receipt UUID required for eReceipt submissions
            :param receipt: receipt dict to be used for UUID generation
            :return: receipt UUID
            :rtype: bytearray
        """
        serialized_json = self._l10n_eg_pos_eta_serialize_receipt_json(receipt)
        return sha256(serialized_json.encode()).hexdigest()

    def _l10n_eg_pos_eta_prepare_receipts(self):
        """
            Prepare the receipt dicts to be submitted to the ETA
            :return: dict containing all the prepared receipts
            :rtype: dict
        """
        res = {}
        for receipt in self:
            old_UUID = ''
            is_refund = receipt.amount_total < 0
            sent_refunds = receipt.lines.refund_orderline_ids.order_id.filtered(lambda o: o.l10n_eg_pos_eta_state == 'sent')
            if sent_refunds and is_refund:
                receipt_json = json.loads(sent_refunds[0].l10n_eg_pos_json_doc_id.raw)
                old_UUID = receipt_json['request']['header']['uuid']
            elif is_refund:
                raise UserError(_("You are trying to submit a refund order with no reference to the refunded document."))
            item_data, totals = receipt._l10n_eg_pos_eta_prepare_receipt_item_data()
            tax_data = receipt._l10n_eg_pos_eta_prepare_receipt_tax_data(totals['total_net'])
            journal_id = receipt.sale_journal
            branch_id = journal_id.l10n_eg_branch_id
            receipt_json = {
                'header': receipt._l10n_eg_pos_eta_prepare_receipt_header(old_UUID),
                'documentType': {
                    'receiptType': 'r' if old_UUID else 'S',
                    'typeVersion': '1.1',
                },
                'seller': {
                    'rin': branch_id.vat,
                    'companyTradeName': branch_id.name,
                    'branchCode': journal_id.l10n_eg_branch_identifier,
                    'branchAddress': {
                        'country': branch_id.country_id.code,
                        'governate': branch_id.state_id.name,
                        'regionCity': branch_id.city,
                        'street': branch_id.street,
                        'buildingNumber': branch_id.l10n_eg_building_no or ''
                    },
                    'deviceSerialNumber': receipt.config_id.l10n_eg_pos_serial,
                    'activityCode': journal_id.l10n_eg_activity_type_id.code,
                },
                'buyer': receipt._l10n_eg_pos_eta_prepare_receipt_buyer(),
                'itemData': item_data,
                'taxTotals': tax_data,
                'totalSales': totals['total_price_subtotal_before_discount'],
                'netAmount': totals['total_net'],
                'totalAmount': self._l10n_eg_edi_round(abs(self.amount_total)),
                'totalCommercialDiscount': totals['discount_total'],
                'paymentMethod': receipt._l10n_eg_pos_get_eta_pos_code()
            }
            receipt_json['header']['uuid'] = self._l10n_eg_pos_eta_get_receipt_uuid(receipt_json)
            res[receipt] = receipt_json
        return res

    @api.model
    def _l10n_eg_pos_eta_authenticate_pos(self, config_id):
        """
            Authenticate the POS based on its configuration and return the request results
            :param config_id: POS Configuration
            :return: Authentication request results
            :rtype: dict
        """
        request_url = '/connect/token'
        company_id = config_id.company_id
        request_data = {
            'body': {
                'grant_type': 'client_credentials',
                'client_id': company_id.l10n_eg_client_identifier,
                'client_secret': company_id.l10n_eg_client_secret,
            },
            'header': {
                'posserial': config_id.l10n_eg_pos_serial,
                'pososversion': config_id.l10n_eg_pos_version,
                'posmodelframework': config_id.l10n_eg_pos_model_framework,
                'presharedkey': config_id.l10n_eg_pos_pre_shared_key,
                'Content-Type': 'application/x-www-form-urlencoded',
            }
        }
        response_data = self._l10n_eg_eta_connect_to_server(
            request_data, request_url, 'POST',
            is_access_token_req=True,
            production_enviroment=company_id.l10n_eg_production_env,
        )
        if response_data.get('error'):
            return response_data
        return {'access_token': response_data.get('response').json().get('access_token')}

    @api.model
    def _l10n_eg_pos_eta_format_request(self, receipts, access_data):
        """
            Format request data to be sent to the ETA
            :param receipts: prepared receipts to be sent
            :param access_data: authentication request results
            :return: formatted body/header dict
            :rtype: dict
        """
        return {
            'header': {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {access_data.get("access_token")}',
            },
            'body': json.dumps(dict(receipts=receipts),ensure_ascii=False, indent=4).encode('utf-8'),
        }

    @api.model
    def _l10n_eg_pos_eta_postprocess_submissions(self, response_data, receipts):
        """
            Postprocess receipt submissions
            :param response_data: ETA response
            :param receipts: submitted receipts
            :return: dict of accepted/rejected receipts or request error
            :rtype: dict
        """
        try:
            if not (isinstance(response_data, dict) and response_data.get('error')):
                response_data = response_data.get('response').json()
        except json.decoder.JSONDecodeError:
            response_data = {'error': _("JSON response could not be parsed")}
        if response_data.get('error'):
            self.write({
                'l10n_eg_pos_eta_state': 'pending',
                'l10n_eg_pos_eta_error': response_data['error'],
            })
            return response_data
        res = {'rejected': [], 'accepted': []}
        for doc in response_data.get('rejectedDocuments', []):
            order_id = receipts[doc['uuid']]['order']
            order_id.write({
                'l10n_eg_pos_eta_state': 'pending',
                'l10n_eg_pos_eta_error': json.dumps(doc['error']),
            })
            res['rejected'].append(order_id.id)
        if response_data.get('submissionId'):
            for doc in response_data.get('acceptedDocuments', []):
                order_id = receipts[doc['uuid']]['order']
                request_data = receipts[doc['uuid']]['request']
                order_id.write({
                    'l10n_eg_pos_json_doc_id': self.env['ir.attachment'].create({
                        'name': _("ETA_RECEIPT_DOC_%s", order_id.name),
                        'res_id': order_id.id,
                        'res_model': order_id._name,
                        'type': 'binary',
                        'raw': json.dumps({
                            'request': request_data,
                            'response': {
                                'l10n_eg_pos_uuid': doc.get('uuid'),
                                'l10n_eg_long_id': doc.get('longId'),
                                'l10n_eg_hash_key': doc.get('hashKey'),
                                'l10n_eg_receipt_number': doc.get('hashKey'),
                                'l10n_eg_pos_submission_number': response_data['submissionId'],
                            }
                        }),
                        'mimetype': 'application/json',
                        'description': _("Egyptian Tax authority JSON receipt generated for %s.", order_id.name),
                    }).id,
                    'l10n_eg_pos_eta_state': 'sent',
                    'l10n_eg_pos_eta_error': '',
                })
                res['accepted'].append(order_id.id)
        return res

    @api.model
    def _l10n_eg_pos_eta_build_json_dict(self, receipts):
        """
            Build a dict of order/request grouped by their uuid to make it easier to postprocess submissions
            :param receipts: prepared receipts dicts
            :return: order/request dicts, prepared requests
            :rtype: tuple(dict, list)
        """
        docs, requests = {}, []
        for order, receipt in receipts.items():
            docs[receipt['header']['uuid']] = {
                'order': order,
                'request': receipt
            }
            requests.append(receipt)
        return docs, requests

    def _l10n_eg_pos_eta_post_receipts(self):
        """
            Prepare a set of pos.order records to be sent to the ETA.
            The Orders should always have the same config so as to be processed correctly

            :return: results of ETA submission
            :rtype: dict
        """
        request_url = '/api/v1/receiptsubmissions'
        self.write({'l10n_eg_pos_eta_state': 'pending'})
        access_data = self._l10n_eg_pos_eta_authenticate_pos(self.config_id)

        if access_data.get('error'):
            self.write({
                'l10n_eg_pos_eta_state': 'pending',
                'l10n_eg_pos_eta_error': access_data['error']
            })
            return {'error': access_data['error']}
        # Prepare json receipts for the POS Orders
        receipt_json = self._l10n_eg_pos_eta_prepare_receipts()

        # Construct a dict to store the order_id and request_data under the request's uuid so the order can be
        # post-processed after wards
        receipt_dict, receipt_requests = self._l10n_eg_pos_eta_build_json_dict(receipt_json)

        # Format the request body & headers before submitting to ETA
        request_data = self._l10n_eg_pos_eta_format_request(receipt_requests, access_data)

        # Submit requests to ETA and await response
        response_data = self._l10n_eg_eta_connect_to_server(
            request_data, request_url, 'POST',
            production_enviroment=self.company_id.l10n_eg_production_env
        )
        return self._l10n_eg_pos_eta_postprocess_submissions(response_data, receipt_dict)

    @api.model
    def _l10n_eg_validate_info_address(self, partner_id, threshold_exceeded):
        """
            Check to see if all the necessary address fields are set on the partner.

            :return: All necessary information is available
            :rtype: bool
        """
        validation_fields = ["country_id", "state_id"]
        is_individual = self._l10n_eg_get_partner_tax_type(partner_id) == 'P'
        if threshold_exceeded or not is_individual:
            validation_fields.append('vat')
        else:
            validation_fields += ["city", "street", "l10n_eg_building_no"]
        return all(partner_id[field] for field in validation_fields)

    @api.model
    def _l10n_eg_validate_buyer(self, partner_id, threshold_exceeded):
        """
            Validate buyer VAT number.

            :return: Vat number validity
            :rtype: bool
        """
        tax_type = self._l10n_eg_get_partner_tax_type(partner_id, False)
        if (threshold_exceeded and tax_type == 'P') or tax_type == 'B':
            return len(partner_id.vat or '') == 14
        return True

    def l10n_eg_pos_eta_check_pos_configuration(self, order_vals):
        """
            Check POS/Config setup to make sure all ETA required fields are set correctly.
            If any errors, raise a UserError
        """
        order_errors = []

        session_id = self.env['pos.session'].browse(order_vals['pos_session_id'])
        if session_id.company_id.country_id.code != 'EG':
            return

        company_id = session_id.company_id
        config_id = session_id.config_id
        partner_id = self.env['res.partner'].browse(order_vals['partner_id'])
        threshold_exceeded = self._l10n_eg_validate_threshold_exceeded(
            order_vals['amount_total'],
            company_id.l10n_eg_invoicing_threshold
        )
        edi = self._l10n_eg_pos_eta_edi_document_format()

        refunded_line_ids = [
            t[2].get('refunded_orderline_id')
            for t in order_vals['lines']
            if t[2].get('refunded_orderline_id')
        ]

        sent_refunds = self.env['pos.order'].search_count([
            ('lines.id', 'in', refunded_line_ids),
            ('l10n_eg_pos_eta_state', '=', 'sent'),
            ('lines.refund_orderline_ids', '=', False)
        ])
        is_refund = order_vals['amount_total'] < 0
        if is_refund and not sent_refunds:
            order_errors.append(_("You cannot issue a Return Receipt that has no reference to an un-refunded order."))

        if any(not config_id[f] for f in ('l10n_eg_pos_serial', 'l10n_eg_pos_model_framework', 'l10n_eg_pos_version')):
            order_errors.append(_("Please, make sure your POS is configured correctly to authenticate with the ETA for receipt submission"))
        if config_id.journal_id.l10n_eg_branch_id.vat == partner_id.vat:
            order_errors.append(_("You cannot issue a receipt to a partner with the same VAT number as the branch."))
        if not edi._l10n_eg_get_eta_token_domain(company_id.l10n_eg_production_env):
            order_errors.append(_("Please configure the token domain from the system parameters"))
        if not edi._l10n_eg_get_eta_api_domain(company_id.l10n_eg_production_env):
            order_errors.append(_("Please configure the API domain from the system parameters"))
        if not all(config_id.journal_id[fname] for fname in ('l10n_eg_branch_id', 'l10n_eg_branch_identifier', 'l10n_eg_activity_type_id')):
            order_errors.append(_("Please set all the ETA information on the receipt's sale journal"))
        if not self._l10n_eg_validate_info_address(config_id.journal_id.l10n_eg_branch_id, threshold_exceeded):
            order_errors.append(_("Please set all the required fields in the branch details"))
        if not self._l10n_eg_validate_info_address(partner_id, threshold_exceeded):
            order_errors.append(_("Please set all the required fields in the customer details"))
        if not self._l10n_eg_validate_buyer(partner_id, threshold_exceeded):
            order_errors.append(_("Please make sure the Buyer data is setup properly, including the VAT number"))
        if not config_id.journal_id.l10n_eg_branch_id.l10n_eg_building_no:
            order_errors.append(_("Please, make sure the building number is defined on the Company Branch"))

        for line_val in order_vals['lines']:
            product_id = self.env['product.product'].browse(line_val[2]['product_id'])
            if not product_id.l10n_eg_eta_code and not product_id.barcode:
                order_errors.append(_("Please make sure the EGS/GS1 Barcode is set correctly on all products"))
            if not product_id.uom_id.l10n_eg_unit_code_id.code:
                order_errors.append(_("Please make sure the receipt lines UoM codes are all set up correctly"))
            tax_ids = [x for t in line_val[2]['tax_ids'] for x in t[2]]
            if not all(tax.l10n_eg_eta_code for tax in self.env['account.tax'].browse(tax_ids)):
                order_errors.append(_("Please make sure the receipt lines taxes all have the correct ETA tax code"))

        if order_errors:
            return ' \n'.join(' - ' + e for e in order_errors)

    def l10n_eg_pos_eta_process_receipts(self):
        """
            Process & submit receipts to the ETA
            :return: Receipt submission results
            :rtype: dict
        """
        order_ids = self.search([
            ('country_code', '=', 'EG'),
            ('to_invoice', '=', False),
            ('lines', '!=', False),
            ('l10n_eg_pos_eta_state', '!=', 'sent'),
            ('id', 'in', self.ids),
            ('account_move', '=', False)]
        )
        if order_ids:
            return order_ids._l10n_eg_pos_eta_post_receipts()
        return {}

    def l10n_eg_pos_eta_process_receipts_from_ui(self):
        """
            Process & submit receipts to the ETA from the POS UI
        :return: Receipt submission results
        :rtype: dict
        """
        results = self.l10n_eg_pos_eta_process_receipts()
        if results.get('error'):
            return results
        return {
            o.id: {
                'l10n_eg_pos_eta_state': o.l10n_eg_pos_eta_state,
                'l10n_eg_pos_eta_error': o.l10n_eg_pos_eta_error,
            } for o in self
        }

    def l10n_eg_pos_eta_check_submissions(self):
        """
            Check ETA submission state for all submitted receipts
        """
        for order in self:
            access_data = self._l10n_eg_pos_eta_authenticate_pos(order.config_id)
            if access_data.get('error'):
                raise UserError(_("Could not authenticate POS: %s", access_data['error']))
            request_url = f'/api/v1/receiptsubmissions/{order.l10n_eg_pos_submission_number}/details?PageNo=1&PageSize=1'
            response_data = self._l10n_eg_eta_connect_to_server(
                {
                    'header':
                        {
                            'Content-Type': 'application/json',
                            'Authorization': f'Bearer {access_data.get("access_token")}'
                        }
                },
                request_url,
                'GET',
                production_enviroment=order.company_id.l10n_eg_production_env
            )
            try:
                receipt_data = response_data.get('response').json()
            except json.decoder.JSONDecodeError:
                raise UserError(_("JSON response could not be parsed"))
            if receipt_data.get('error'):
                raise UserError(response_data['error'])
            if receipt_data['status'] == 'Valid':
                order.l10n_eg_pos_eta_submission_state = 'valid'
            elif receipt_data['status'] == 'Invalid':
                order.l10n_eg_pos_eta_submission_state = 'invalid'
                submission_errors = [e for err in receipt_data['receipts'][0]['errors'] for e in err['error']['innerError']]
                order.l10n_eg_pos_eta_submission_errors = '\n'.join(' -  ' + r['error'] for r in submission_errors)

    @api.model
    def _cron_check_eta_submissions(self):
        """
            Scheduled action that retrieves the submission state of all submitted receipts.
        """
        submissions = self.search([
            ('l10n_eg_pos_eta_state', '=', 'sent'),
            ('l10n_eg_pos_eta_submission_state', '=', 'pending')
        ])
        submissions.l10n_eg_pos_eta_check_submissions()

    # region OVERRIDES
    @api.model
    def _load_pos_data_fields(self, config_id):
        params = super()._load_pos_data_fields(config_id)
        if self.env.company.country_id.code == 'EG':
            params += ['l10n_eg_pos_eta_state']
        return params

    @api.model
    def _process_order(self, order, existing_order):
        """
            Override to submit receipts to the eta once they are created
        """
        order_id = super()._process_order(order, existing_order)
        self.browse(order_id).l10n_eg_pos_eta_process_receipts()
        return order_id

    def action_pos_order_invoice(self):
        """
            Override to add a check on the ETA & Submission state when trying to invoice a POS order
        """
        if any(o.l10n_eg_pos_eta_state == 'sent' and o.l10n_eg_pos_eta_submission_state != 'invalid' for o in self):
            raise UserError(
                _("Cannot invoice a POS order once it has been sent to the ETA. Please, submit the receipt and check its Status before proceeding.")
            )
        res = super().action_pos_order_invoice()
        self.filtered('is_invoiced').l10n_eg_pos_eta_state = 'ignore'
        return res
    # endregion
