import json
from hashlib import sha256

from odoo import _, api, fields, models
from odoo.addons.l10n_eg_edi_eta.models.account_edi_format import ETA_DOMAINS
from odoo.exceptions import UserError, ValidationError
from odoo.tools import float_compare, float_is_zero

ETA_DATETIME_FORMAT = '%Y-%m-%dT%H:%M:%SZ'

class PosOrder(models.Model):
    _inherit = 'pos.order'

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
    l10n_eg_pos_eta_error = fields.Text(string="EDI Error")

    @api.depends('company_id.l10n_eg_production_env', 'date_order', 'l10n_eg_pos_uuid')
    def _compute_l10n_eg_pos_compute_qrcode(self):
        """
            Compute the QR code string used to render the QR code on the receipt.
            :return: QR Code string
            :rtype: str
        """
        for order in self:
            api_domain_key = ('pre' if not order.company_id.l10n_eg_production_env else '') + 'production'
            api_domain = ETA_DOMAINS[api_domain_key]
            if order.l10n_eg_pos_uuid:
                order.l10n_eg_pos_qrcode = "%s/receipts/search/%s/share/%s" % (api_domain, order.l10n_eg_pos_uuid, order.date_order.strftime(ETA_DATETIME_FORMAT))
            else:
                order.l10n_eg_pos_qrcode = ''

    @api.depends('l10n_eg_pos_json_doc_id.raw')
    def _compute_l10n_eg_eta_compute_pos_response_data(self):
        for rec in self:
            response_data = {} if not rec.l10n_eg_pos_json_doc_id else json.loads(rec.l10n_eg_pos_json_doc_id.raw).get('response', {})
            rec.l10n_eg_pos_uuid = response_data.get('l10n_eg_pos_uuid', False)
            rec.l10n_eg_pos_submission_number = response_data.get('l10n_eg_pos_submission_number', False)

    @api.model
    def _process_order(self, order, existing_order):
        """
            Override to submit receipts to the eta once they are created
        """
        order_id = super()._process_order(order, existing_order)
        self.browse(order_id).l10n_eg_pos_eta_process_receipts()
        return order_id

    def action_pos_order_invoice(self):
        if any(o.l10n_eg_pos_eta_state == 'sent' for o in self):
            raise UserError(_("Cannot invoice a POS order once it has been sent to the ETA"))
        res = super().action_pos_order_invoice()
        for order in self.filtered(lambda o: o.is_invoiced):
            order.l10n_eg_pos_eta_state = 'ignore'
        return res

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
            production_enviroment
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

    def _l10n_eg_pos_eta_get_payment_method(self):
        """
            Get the ETA payment method code for the payment methods selected on the order
            :return: ETA payment method code
            :rtype: str
        """
        self.ensure_one()
        if self.payment_ids:
            return self.payment_ids.payment_method_id.l10n_eg_pos_eta_code
        return 'C'

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
            'value': ''
        }]

    def _l10n_eg_pos_eta_prepare_receipt_header(self):
        """
            Return the header dict required for the receipts.
            :return: receipt header
            :rtype: dict
        """
        self.ensure_one()
        header_dict = {
            'dateTimeIssued': self.date_order.strftime(ETA_DATETIME_FORMAT),
            'receiptNumber': self.pos_reference,
            'uuid': '',
            'currency': self.currency_id.name,
            'exchangeRate': 0 if self.country_code == 'EG' else self._l10n_eg_edi_round(self._l10n_eg_pos_eta_exchange_currency_rate()),
            'sOrderNameCode': self.name,
            'orderdeliveryMode': 'FC',
            'grossWeight': 0.0,
            'netWeight': 0.0
        }
        if previous_receipt := self._l10n_eg_pos_eta_get_previous_receipt():
            header_dict['previousUUID'] = previous_receipt.l10n_eg_pos_uuid
        if sent_refunds := self.lines.refunded_orderline_id.order_id.filtered(lambda o: o.l10n_eg_pos_eta_state == 'sent'):
            header_dict['referenceUUID'] = sent_refunds[0].l10n_eg_pos_uuid
        if not sent_refunds and float_compare(self.amount_total, 0, precision_digits=5) == -1:
            header_dict['documentUseReason'] = 'I' if self.partner_id.country_id.code != self.country_code else 'B'
            header_dict['salesIssuedDateTime'] = header_dict['dateTimeIssued']
        return header_dict

    def _l10n_eg_pos_eta_prepare_receipt_item_data(self):
        """
            Prepare the receipt lines for the eReceipt submission, as well as a totals dict to be used in other
            parts of the receipt
            :return: Receipt lines, totals dict
            :rtype: tuple(list, dict)
        """
        self.ensure_one()
        lines, global_discounts = [], []
        totals = {
            'total': 0.0,
            'total_net': 0.0,
            'total_discount': 0.0,
            'total_sale': 0.0,
            'total_extra_discount': 0.0
        }
        tax_types = {}
        refund_type = self._l10n_eg_pos_get_refund_type()
        order_sign = 1 if not refund_type else -1
        for line in self.lines:
            price_unit = self._l10n_eg_edi_round(line.price_unit, 2)

            price_subtotal = self._l10n_eg_edi_round(line.price_subtotal) * order_sign
            price_total = self._l10n_eg_edi_round(line.price_subtotal_incl) * order_sign

            rate_before_discount = (1 - (line.discount / 100)) if (0 < line.discount < 100) else 1
            price_subtotal_before_discount = self._l10n_eg_edi_round(price_subtotal / rate_before_discount)

            item_code = line.product_id.l10n_eg_eta_code or line.product_id.barcode
            taxes = line.tax_ids.filtered(lambda t: t.company_id.id == line.order_id.company_id.id)
            taxes = self.fiscal_position_id.map_tax(taxes)
            tax_details = taxes.compute_all(
                price_unit * rate_before_discount,
                line.order_id.pricelist_id.currency_id,
                line.qty,
                product=line.product_id,
                partner=line.order_id.partner_id or False
            )

            net_sale = abs(self._l10n_eg_edi_round(price_subtotal))
            line_total = abs(self._l10n_eg_edi_round(price_total))
            total_sale = abs(price_subtotal_before_discount)
            #   A line is only processed as such in two cases:
            #       1. The total price is greater than 0
            #       2. The line's price_unit is greater than 0 and the order is a refund
            #   Case two simply ensures that we do not process a global discount line as a standard line
            #   if the order is a refund
            if price_total >= 0 or (price_unit > 0 and refund_type):
                discount_amount = self._l10n_eg_edi_round(total_sale - net_sale)
                totals['total_discount'] += abs(discount_amount)
                totals['total_sale'] += total_sale
                totals['total_net'] += net_sale
                totals['total'] += line_total
                line_json = {
                    'internalCode': line.product_id.default_code or '',
                    'description': line.name,
                    'itemType': item_code.startswith('EG') and 'EGS' or 'GS1',
                    'itemCode': item_code,
                    'unitType': line.product_uom_id.l10n_eg_unit_code_id.code,
                    'quantity': abs(line.qty),
                    'unitPrice': price_unit,
                    'netSale': net_sale,
                    'totalSale': total_sale,
                    'total': abs(line_total),
                    'taxableItems': [],
                    'commercialDiscountData': [{
                        'amount': discount_amount,
                        'description': f"{line.discount}% Discount",
                        'rate': line.discount,
                    }] if line.discount else []
                }
                for tax in tax_details['taxes']:
                    tax_id = self.env['account.tax'].browse(tax['id'])
                    tax_type, tax_subtype = tax_id._get_l10n_eg_eta_code_types()
                    line_json['taxableItems'].append({
                        'taxType': tax_type,
                        'amount': self._l10n_eg_edi_round(abs(tax['amount'])),
                        'subType': tax_subtype,
                        'rate': tax_id.amount,
                    })
                    if not tax_types.get(tax['id']):
                        tax_types[tax['id']] = {
                            'taxType': tax_type,
                            'amount': 0,
                        }
                    tax_types[tax['id']]['amount'] += abs(tax['amount'])
                lines.append(line_json)
            else:
                totals['total_extra_discount'] += line_total
                global_discounts.append({
                    'amount': line_total,
                    'description': line.name,
                })

        for discount_values in global_discounts:
            discount_values['rate'] = self._l10n_eg_edi_round(discount_values['amount'] / (totals['total_net'] / 100))
        for tax_grp in tax_types:
            tax_types[tax_grp]['amount'] = self._l10n_eg_edi_round(tax_types[tax_grp]['amount'])
        return lines, global_discounts, totals, tax_types

    def _l10n_eg_pos_eta_prepare_receipt_buyer(self):
        """
            Return the receipt buyer dict required for the receipts
            :return: receipt buyer
            :rtype: dict
        """
        self.ensure_one()
        partner_id = self.partner_id
        partner_type = self._l10n_eg_get_partner_tax_type(partner_id)
        buyer_dict = {
            'type': partner_type,
            'paymentNumber': ''
        }
        if float_compare(self.amount_total, self.company_id.l10n_eg_invoicing_threshold, precision_digits=5) >= 0 or partner_type != 'P':
            buyer_dict['id'] = partner_id.vat or ''
            buyer_dict['name'] = partner_id.name
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
            document_string += _format_key(key)
            if isinstance(value, list):
                for list_item in value:
                    document_string += _format_key(key)
                    document_string += self._l10n_eg_pos_eta_serialize_receipt_json(list_item)
            else:
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

    def _l10n_eg_pos_get_refund_type(self):
        self.ensure_one()
        receipt_type = None
        if len(self.lines.refunded_orderline_id.order_id) != 0:
            receipt_type = 'r'
        elif float_compare(self.amount_total, 0, precision_digits=5) == -1:
            receipt_type = 'RWR'
        return receipt_type

    def _l10n_eg_pos_get_document_type(self):
        self.ensure_one()
        receipt_type = self._l10n_eg_pos_get_refund_type() or 'S'
        return {
            'receiptType': receipt_type,
            'typeVersion': self.env['ir.config_parameter'].get_param('l10n_eg_pos_edi_eta.document_type_version', '1.2')
        }

    def _l10n_eg_pos_eta_prepare_receipts(self):
        """
            Prepare the receipt dicts to be submitted to the ETA
            :return: dict containing all the prepared receipts
            :rtype: dict
        """
        res = {}
        for receipt in self:
            item_data, global_discounts, totals, taxTypes = receipt._l10n_eg_pos_eta_prepare_receipt_item_data()
            journal_id = receipt.sale_journal
            branch_id = journal_id.l10n_eg_branch_id
            receipt_json = {
                'header': receipt._l10n_eg_pos_eta_prepare_receipt_header(),
                'documentType': receipt._l10n_eg_pos_get_document_type(),
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
                'extraReceiptDiscountData': global_discounts,
                'totalSales': self._l10n_eg_edi_round(totals['total_sale']),
                'netAmount': self._l10n_eg_edi_round(totals['total_net']),
                'totalAmount': self._l10n_eg_edi_round(totals['total'] - totals['total_extra_discount']),
                'taxTotals': [tax for tax in taxTypes.values()],
                'paymentMethod': receipt._l10n_eg_pos_eta_get_payment_method(),
                'totalCommercialDiscount': self._l10n_eg_edi_round(totals['total_discount'])
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
                'client_id': company_id.sudo().l10n_eg_client_identifier,
                'client_secret': company_id.sudo().l10n_eg_client_secret,
            },
            'header': {
                'posserial': config_id.l10n_eg_pos_serial,
                'pososversion': config_id.l10n_eg_pos_version,
                'posmodelframework': config_id.l10n_eg_pos_model_framework,
                'presharedkey': config_id.l10n_eg_pos_client_id,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
        response_data = self._l10n_eg_eta_connect_to_server(
            request_data, request_url,
            method='POST', is_access_token_req=True,
            production_enviroment=company_id.l10n_eg_production_env
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
                'Authorization': 'Bearer %s' % access_data.get('access_token')
            },
            'body': json.dumps(dict(receipts=receipts), ensure_ascii=False, indent=4).encode('utf-8')
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
        if response_data.get('error') or not hasattr(response_data.get('response'), 'json'):
            self.l10n_eg_pos_eta_state = 'pending'
            self.l10n_eg_pos_eta_error = response_data.get('error', _("JSON response could not be parsed"))
            return response_data
        response_data = response_data.get('response').json()
        res = {'rejected': [], 'accepted': []}
        for doc in response_data.get('rejectedDocuments', []):
            order_id = receipts[doc['uuid']]['order']
            order_id.l10n_eg_pos_eta_state = 'pending'
            order_id.l10n_eg_pos_eta_error = json.dumps(doc['error'])
            res['rejected'].append(order_id.id)
        if response_data.get('submissionId'):
            for doc in response_data.get('acceptedDocuments', []):
                order_id = receipts[doc['uuid']]['order']
                request_data = receipts[doc['uuid']]['request']
                order_id.write({
                    'l10n_eg_pos_json_doc_id': self.env['ir.attachment'].create({
                        'name': _('ETA_RECEIPT_DOC_%s', order_id.name),
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
                        'description': _('Egyptian Tax authority JSON receipt generated for %s.', order_id.name),
                    }).id,
                    'l10n_eg_pos_eta_state': 'sent',
                    'l10n_eg_pos_eta_error': ''
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
            The Orders should always have the same config to be correctly processed
            :return: results of ETA submission
            :rtype: dict
        """
        request_url = '/api/v1/receiptsubmissions'
        self.l10n_eg_pos_eta_state = 'pending'
        config_id = self.config_id
        company_id = self.company_id
        access_data = self._l10n_eg_pos_eta_authenticate_pos(config_id)

        if access_data.get('error'):
            self.l10n_eg_pos_eta_state = 'pending'
            self.l10n_eg_pos_eta_error = access_data['error']
            return {
                'error': access_data['error']
            }
        # Prepare json receipts for the POS Orders
        receipt_json = self._l10n_eg_pos_eta_prepare_receipts()

        # Construct a dict to store the order_id and request_data under the request's uuid so the order can be
        # post-processed after wards
        receipt_dict, receipt_requests = self._l10n_eg_pos_eta_build_json_dict(receipt_json)

        # Format the request body & headers before submitting to ETA
        request_data = self._l10n_eg_pos_eta_format_request(receipt_requests, access_data)

        # Submit requests to ETA and await response
        response_data = self._l10n_eg_eta_connect_to_server(
            request_data, request_url,
            method='POST',
            production_enviroment=company_id.l10n_eg_production_env
        )
        return self._l10n_eg_pos_eta_postprocess_submissions(response_data, receipt_dict)

    @api.model
    def _l10n_eg_validate_info_address(self, partner_id, issuer=False, invoice=False):
        fields_to_validate = ["country_id", "state_id"]
        threshold_exceeded = invoice and invoice.amount_total >= invoice.company_id.l10n_eg_invoicing_threshold
        is_individual = self._l10n_eg_get_partner_tax_type(partner_id, issuer) == 'P'
        if threshold_exceeded or not is_individual:
            fields_to_validate.append('vat')
        if not is_individual:
            fields_to_validate += ["city", "street", "l10n_eg_building_no"]
        return all(partner_id[field] for field in fields_to_validate)

    def _l10n_eg_pos_eta_check_pos_configuration(self):
        """
            Check POS/Config setup to make sure all ETA required fields are set correctly.
            If any errors, raise a UserError
        """
        errors = {}
        for order in self:

            order_errors = []
            journal_id = order.sale_journal
            edi = self._l10n_eg_pos_eta_edi_document_format()

            if any(not order.config_id[f] for f in ('l10n_eg_pos_serial', 'l10n_eg_pos_version')):
                order_errors.append(_("Please, make sure your POS is configured correctly to authenticate with the ETA for receipt submission"))
            if journal_id.l10n_eg_branch_id.vat == order.partner_id.vat:
                order_errors.append(_("You cannot issue a receipt to a partner with the same VAT number as the branch."))
            if not edi._l10n_eg_get_eta_token_domain(order.company_id.l10n_eg_production_env):
                order_errors.append(_("Please configure the token domain from the system parameters"))
            if not edi._l10n_eg_get_eta_api_domain(order.company_id.l10n_eg_production_env):
                order_errors.append(_("Please configure the API domain from the system parameters"))
            if not all(journal_id[fname] for fname in ('l10n_eg_branch_id', 'l10n_eg_branch_identifier', 'l10n_eg_activity_type_id')):
                order_errors.append(_("Please set all the ETA information on the receipt's sale journal"))
            if not self._l10n_eg_validate_info_address(journal_id.l10n_eg_branch_id):
                order_errors.append(_("Please set all the required fields in the branch details"))
            if not self._l10n_eg_validate_info_address(order.partner_id):
                order_errors.append(_("Please set all the required fields in the customer details"))
            if not journal_id.l10n_eg_branch_id.l10n_eg_building_no:
                order_errors.append(_("Please, make sure the building number is defined on the Company Branch"))
            if not all(ln.product_uom_id.l10n_eg_unit_code_id.code for ln in order.lines):
                order_errors.append(_("Please make sure the receipt lines UoM codes are all set up correctly"))
            if not all(tax.l10n_eg_eta_code for tax in order.lines.tax_ids):
                order_errors.append(_("Please make sure the receipt lines taxes all have the correct ETA tax code"))
            if not all(ln.product_id.l10n_eg_eta_code or ln.product_id.barcode for ln in order.lines):
                order_errors.append(_("Please make sure the EGS/GS1 Barcode is set correctly on all products"))

            if order_errors:
                errors[order] = order_errors

        if errors:
            raise ValidationError(
                ''.join(
                    _("\n Order %s could not be created:\n%s\n") % (o.name, ' \n'.join(' - ' + e for e in errors[o]))
                    for o in errors)
            )

    def _cron_check_eta_submissions(self):
        """
            Process & submit receipts to the ETA
        """
        order_ids = self.search([
            ('country_code', '=', 'EG'),
            ('to_invoice', '=', False),
            ('lines', '!=', False),
            ('l10n_eg_pos_eta_state', '=', 'pending'),
            ('account_move', '=', False)
        ], limit=100)
        try:  # try processing in batch
            with self.env.cr.savepoint():
                order_ids._l10n_eg_pos_eta_check_pos_configuration()
                order_ids._l10n_eg_pos_eta_post_receipts()
        except UserError:  # if at least one order cannot be synchronized, handle orders one by one
            for order in order_ids:
                try:
                    with self.env.cr.savepoint():
                        order._l10n_eg_pos_eta_check_pos_configuration()
                        order._l10n_eg_pos_eta_post_receipts()
                except UserError as e:
                    msg = _('The order could not be synchronized for the following reason: %(error_message)s', error_message=e)
                    order.message_post(body=msg, message_type='comment')

        if len(order_ids) == 100:  # assumes there are more whenever search hits limit
            self.env.ref('l10n_eg_pos_edi_eta.ir_cron_check_eta_submissions')._trigger()

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
            ('account_move', '=', False)
        ])
        if order_ids:
            order_ids._l10n_eg_pos_eta_check_pos_configuration()
            return order_ids._l10n_eg_pos_eta_post_receipts()
        return {}

    def l10n_eg_pos_eta_process_receipts_frontend(self):
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
                'l10n_eg_pos_eta_error': o.l10n_eg_pos_eta_error
            } for o in self
        }
