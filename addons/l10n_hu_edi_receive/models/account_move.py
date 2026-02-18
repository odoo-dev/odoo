# Part of Odoo. See LICENSE file for full copyright and licensing details.

from base64 import b64decode, b64encode
import gzip
from datetime import datetime
from lxml import etree

from odoo import Command, _, api, fields, models
from odoo.addons.base.models.res_bank import sanitize_account_number
from odoo.addons.l10n_hu_edi.models.l10n_hu_edi_connection import XML_NAMESPACES


def boolean(value):
    return value == 'true'


def parse_vat(tax_number_xml):
    if tax_number_xml is None:
        return

    vat = tax_number_xml.findtext('base:taxpayerId', namespaces=XML_NAMESPACES)
    if vat_code := tax_number_xml.findtext('base:vatCode', namespaces=XML_NAMESPACES):
        vat += '-' + vat_code
    if county_code := tax_number_xml.findtext('base:countyCode', namespaces=XML_NAMESPACES):
        vat += '-' + county_code
    return vat


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_hu_edi_batch_index = fields.Integer(
        string='Index of invoice within a batch modification',
        copy=False,
    )

    @api.depends('name', 'ref')
    def _compute_l10n_hu_edi_attachment_filename(self):
        nav_receiving_moves = self.filtered(lambda m: m.move_type in self.env['account.move'].get_purchase_types() and m.ref)
        for move in nav_receiving_moves:
            move.l10n_hu_edi_attachment_filename = f'{move.ref.replace("/", "_")}.xml'
        super(AccountMove, self - nav_receiving_moves)._compute_l10n_hu_edi_attachment_filename()

    @api.model
    def _l10n_hu_edi_parse_digest_response(self, response_xml):
        digests = []
        for digest in response_xml.iterfind('api:invoiceDigestResult/api:invoiceDigest', namespaces=XML_NAMESPACES):
            l10n_hu_edi_transaction_code = digest.findtext('api:transactionId', namespaces=XML_NAMESPACES)
            l10n_hu_edi_batch_upload_index = int(digest.findtext('api:index', namespaces=XML_NAMESPACES))
            move_domain = [
                *self.env['account.move']._check_company_domain(self.env.company),
                ('move_type', 'in', self.env['account.move'].get_purchase_types()),
                ('l10n_hu_edi_transaction_code', '=', l10n_hu_edi_transaction_code),
                ('l10n_hu_edi_batch_upload_index', '=', l10n_hu_edi_batch_upload_index),
            ]
            if l10n_hu_edi_batch_index := digest.findtext('api:batchIndex', namespaces=XML_NAMESPACES):
                move_domain.append(('l10n_hu_edi_batch_index', '=', int(l10n_hu_edi_batch_index)))
            move = self.env['account.move'].search(move_domain, limit=1)
            if move:
                continue

            query_invoice_data_params = {
                'invoiceNumber': digest.findtext('api:invoiceNumber', namespaces=XML_NAMESPACES),
                'invoiceDirection': 'INBOUND',
                'supplierTaxNumber': digest.findtext('api:supplierTaxNumber', namespaces=XML_NAMESPACES),
            }
            if l10n_hu_edi_batch_index:
                query_invoice_data_params['batchIndex'] = l10n_hu_edi_batch_index

            digests.append(query_invoice_data_params)

        return digests

    @api.model
    def _l10n_hu_edi_parse_query_invoice_data_response(self, response_xml):
        invoice_data_b64 = response_xml.findtext('api:invoiceDataResult/api:invoiceData', namespaces=XML_NAMESPACES)
        if boolean(response_xml.findtext('api:invoiceDataResult/api:compressedContentIndicator', namespaces=XML_NAMESPACES)):
            invoice_data_b64 = b64encode(gzip.decompress(b64decode(invoice_data_b64)))

        audit_data = response_xml.find('api:invoiceDataResult/api:auditData', namespaces=XML_NAMESPACES)
        move_vals = {
            'l10n_hu_edi_transaction_code': audit_data.findtext('api:transactionId', namespaces=XML_NAMESPACES),
            'l10n_hu_edi_batch_upload_index': int(audit_data.findtext('api:index', namespaces=XML_NAMESPACES)),
            'l10n_hu_edi_send_time': datetime.fromisoformat(audit_data.findtext('api:insdate', namespaces=XML_NAMESPACES).replace('Z', '')),
            'l10n_hu_edi_attachment': invoice_data_b64,
        }

        return self._l10n_hu_edi_parse_invoice_data_xml(etree.fromstring(b64decode(invoice_data_b64)), move_vals)

    @api.model
    def _l10n_hu_edi_parse_invoice_data_xml(self, invoice_data_xml, move_vals={}):
        moves_vals = []
        move_vals.update({
            'ref': invoice_data_xml.findtext('data:invoiceNumber', namespaces=XML_NAMESPACES),
            'invoice_date': fields.Date.from_string(invoice_data_xml.findtext('api:invoiceIssueDate', namespaces=XML_NAMESPACES)),
        })
        if (invoice_xml := invoice_data_xml.find('data:invoiceMain/data:invoice', namespaces=XML_NAMESPACES)) is not None:
            moves_vals.append({
                **move_vals,
                **self._l10n_hu_edi_parse_invoice_xml(invoice_xml),
            })
        else:
            for batch_invoice in invoice_data_xml.iterfind('data:invoiceMain/data:batchInvoice', namespaces=XML_NAMESPACES):
                moves_vals.append({
                    **move_vals,
                    **self._l10n_hu_edi_parse_invoice_xml(batch_invoice.find('data:invoice', namespaces=XML_NAMESPACES)),
                    'l10n_hu_edi_batch_index': int(batch_invoice.findtext('data:batchIndex', namespaces=XML_NAMESPACES)),
                })

        return moves_vals

    @api.model
    def _l10n_hu_edi_parse_invoice_xml(self, invoice_xml):
        invoice_head = invoice_xml.find('data:invoiceHead', namespaces=XML_NAMESPACES)
        invoice_detail = invoice_head.find('data:invoiceDetail', namespaces=XML_NAMESPACES)
        invoice_category = invoice_detail.findtext('data:invoiceCategory', namespaces=XML_NAMESPACES)
        simplified = invoice_category == 'SIMPLIFIED'

        invoice_reference = invoice_xml.find('data:invoiceReference', namespaces=XML_NAMESPACES)
        base_invoice = invoice_reference is None

        if base_invoice:
            move_type = 'in_invoice'
        else:
            total_path = 'data:invoiceSummary/data:summaryGrossData/data:invoiceGrossAmount' if simplified else 'data:invoiceSummary/data:summaryNormal/data:invoiceNetAmount'
            total = float(invoice_xml.findtext(total_path, namespaces=XML_NAMESPACES))
            move_type = 'in_refund' if total < 0 else 'in_invoice'

        supplier_info = invoice_head.find('data:supplierInfo', namespaces=XML_NAMESPACES)
        partner_vat = (
            supplier_info.findtext('data:groupMemberTaxNumber/base:taxpayerId', namespaces=XML_NAMESPACES) or
            supplier_info.findtext('data:supplierTaxNumber/base:taxpayerId', namespaces=XML_NAMESPACES)
        )
        partner = self.env['res.partner'].search([('vat', '=ilike', partner_vat + '%')], limit=1)
        if not partner:
            supplier_tax_number = parse_vat(supplier_info.find('data:supplierTaxNumber', namespaces=XML_NAMESPACES))
            supplier_group_member_tax_number = parse_vat(supplier_info.find('data:groupMemberTaxNumber', namespaces=XML_NAMESPACES))
            supplier_address = supplier_info.find('data:supplierAddress/bsae:simpleAddress', namespaces=XML_NAMESPACES)
            partner_vals = {
                'name': supplier_info.findtext('data:supplierName', namespaces=XML_NAMESPACES),
                'vat': supplier_group_member_tax_number or supplier_tax_number,
                'country_id': self.env['res.country'].search([('code', '=', supplier_address.findtext('base:countryCode', namespaces=XML_NAMESPACES))], limit=1).id,
                'zip': supplier_address.findtext('base:postalCode', namespaces=XML_NAMESPACES),
                'city': supplier_address.findtext('base:city', namespaces=XML_NAMESPACES),
                'street': supplier_address.findtext('base:additionalAddressDetail', namespaces=XML_NAMESPACES),
            }
            if supplier_group_member_tax_number:
                partner_vals['l10n_hu_group_vat'] = supplier_tax_number

            partner = self.env['res.partner'].create(partner_vals)

            if supplier_bank_account_number := supplier_info.findtext('data:supplierBankAccountNumber', namespaces=XML_NAMESPACES):
                partner.bank_ids = [Command.create({
                    'acc_number': supplier_bank_account_number,
                    'partner_id': partner.id,
                })]

        move_vals = {
            'l10n_hu_invoice_chain_index': -1 if base_invoice else int(invoice_reference.findtext('data:modificationIndex', namespaces=XML_NAMESPACES)),
            'delivery_date': invoice_detail.findtext('data:invoiceDeliveryDate', namespaces=XML_NAMESPACES),
            'currency_id': self.env['res.currency'].with_context(active_test=False).search([('name', '=', invoice_detail.findtext('data:currencyCode', namespaces=XML_NAMESPACES))], limit=1).id,
            'invoice_currency_rate': float(invoice_detail.findtext('data:exchangeRate', namespaces=XML_NAMESPACES)),
            'move_type': move_type,
            'partner_id': partner.id,
        }

        if l10n_hu_payment_mode := invoice_detail.findtext('data:paymentMethod', namespaces=XML_NAMESPACES):
            move_vals['l10n_hu_payment_mode'] = l10n_hu_payment_mode
        if invoice_date_due := invoice_detail.findtext('data:paymentDate', namespaces=XML_NAMESPACES):
            move_vals['invoice_date_due'] = fields.Date.from_string(invoice_date_due)

        if (
            not base_invoice
            and boolean(invoice_reference.findtext('data:modifyWithoutMaster', namespaces=XML_NAMESPACES))
            and (original_invoice := self.search([('ref', '=', invoice_reference.findtext('data:originalInvoiceNumber', namespaces=XML_NAMESPACES)), ('partner_id', '=', partner.id)], limit=1))
        ):
            if move_type == 'in_refund':
                move_vals['reversed_entry_id'] = original_invoice.id
            elif move_type == 'in_invoice':
                move_vals['debit_origin_id'] = original_invoice.id

        if move_type == 'in_invoice' and (supplier_bank_account_number := supplier_info.findtext('data:supplierBankAccountNumber', namespaces=XML_NAMESPACES)):
            partner_bank = self.env['res.partner.bank'].search([('sanitized_acc_number', '=', sanitize_account_number(supplier_bank_account_number)), ('partner_id', '=', partner.id)], limit=1)
            if not partner_bank:
                partner_bank = self.env['res.partner.bank'].create({
                    'acc_number': supplier_bank_account_number,
                    'partner_id': partner.id,
                })
            move_vals['partner_bank_id'] = partner_bank.id
        elif move_type == 'in_refund' and (customer_bank_account_number := invoice_head.findtext('data:customerInfo/data:customerBankAccountNumber', namespaces=XML_NAMESPACES)):
            partner_bank = self.env['res.partner.bank'].search([('sanitized_acc_number', '=', sanitize_account_number(customer_bank_account_number)), ('partner_id', '=', self.env.company.partner_id.id)], limit=1)
            if not partner_bank:
                partner_bank = self.env['res.partner.bank'].create({
                    'acc_number': customer_bank_account_number,
                    'partner_id': self.env.company.partner_id.id,
                })
            move_vals['partner_bank_id'] = partner_bank.id

        lines_vals = []
        for line in invoice_xml.iterfind('data:invoiceLines/data:line', namespaces=XML_NAMESPACES):
            line_vals = {'display_type': 'product'}

            if boolean(line.findtext('data:advanceData/data:advanceIndicator', namespaces=XML_NAMESPACES)) and 'is_downpayment' in self.env['account.move.line']:
                line_vals['is_downpayment'] = True

            if line_description := line.findtext('data:lineDescription', namespaces=XML_NAMESPACES):
                line_vals['name'] = line_description

            if (product_codes := line.find('data:productCodes', namespaces=XML_NAMESPACES)) is not None:
                for product_code in product_codes.iterfind('data:productCode', namespaces=XML_NAMESPACES):
                    product_info = {'name': line_vals.get('name')}
                    if product_code_own_value := product_code.findtext('data:productCodeOwnValue', namespaces=XML_NAMESPACES):
                        product_info['default_code'] = product_code_own_value
                    else:
                        product_info['extra_domain'] = [
                            ('l10n_hu_product_code_type', '=', product_code.findtext('data:productCodeCategory', namespaces=XML_NAMESPACES)),
                            ('l10n_hu_product_code', '=', product_code.findtext('data:productCodeValue', namespaces=XML_NAMESPACES)),
                        ]

                    product = self.env['product.product']._retrieve_product(**product_info)
                    if product:
                        line_vals['product_id'] = product.id
                        break

            if unit_of_measure := line.findtext('data:unitOfMeasure', namespaces=XML_NAMESPACES):
                uom_domain = [('name', '=', line.findtext('data:unitOfMeasureOwn', namespaces=XML_NAMESPACES))] if unit_of_measure == 'OWN' else [('l10n_hu_edi_code', '=', unit_of_measure)]
                if uom := self.env['uom.uom'].search(uom_domain, limit=1):
                    line_vals['product_uom_id'] = uom.id

            if discount_rate := line.findtext('data:lineDiscountData/data:discountRate', namespaces=XML_NAMESPACES):
                line_vals['discount'] = float(discount_rate) * 100

            sign = -1 if move_type == 'in_refund' else 1
            if quantity := line.findtext('data:quantity', namespaces=XML_NAMESPACES):
                quantity = float(quantity)
                if quantity < 0:
                    quantity *= sign
                    sign = 1
            else:
                quantity = 1
            line_vals['quantity'] = quantity

            amounts = line.find(f'data:{'lineAmountsSimplified' if simplified else 'lineAmountsNormal'}', namespaces=XML_NAMESPACES)
            if price_unit := line.findtext('data:unitPrice', namespaces=XML_NAMESPACES):
                line_vals['price_unit'] = sign * float(price_unit)
            else:
                total_path = 'data:lineGrossAmountSimplified' if simplified else 'data:lineNetAmountData/data:lineNetAmount'
                total = amounts.findtext(total_path, namespaces=XML_NAMESPACES)
                line_vals['price_unit'] = sign * float(total) / quantity

            line_vat_rate = amounts.find('data:lineVatRate', namespaces=XML_NAMESPACES)
            l10n_hu_tax_type = rate = None
            if vat_percentage := line_vat_rate.findtext('data:vatPercentage', namespaces=XML_NAMESPACES):
                rate = vat_percentage
                l10n_hu_tax_type = 'VAT'
            elif (vat_exemption := line_vat_rate.find('data:vatExemption', namespaces=XML_NAMESPACES)) is not None:
                l10n_hu_tax_type = vat_exemption.findtext('data:case', namespaces=XML_NAMESPACES)
            elif (vat_out_of_scope := line_vat_rate.find('data:vatOutOfScope', namespaces=XML_NAMESPACES)) is not None:
                l10n_hu_tax_type = vat_out_of_scope.findtext('data:case', namespaces=XML_NAMESPACES)
            elif boolean(line_vat_rate.findtext('data:vatDomesticReverseCharge', namespaces=XML_NAMESPACES)):
                l10n_hu_tax_type = 'DOMESTIC_REVERSE'
            elif margin_scheme_indicator := line_vat_rate.findtext('data:marginSchemeIndicator', namespaces=XML_NAMESPACES):
                l10n_hu_tax_type = margin_scheme_indicator
            elif (vat_amount_mismatch := line_vat_rate.find('data:vatAmountMismatch', namespaces=XML_NAMESPACES)) is not None:
                l10n_hu_tax_type = vat_amount_mismatch.findtext('data:case', namespaces=XML_NAMESPACES)
                rate = vat_amount_mismatch.findtext('data:vatRate/data:vatPercentage', namespaces=XML_NAMESPACES)
            elif boolean(line_vat_rate.findtext('data:noVatCharge', namespaces=XML_NAMESPACES)):
                l10n_hu_tax_type = 'NO_VAT'
            elif rate := line_vat_rate.findtext('data:vatContent', namespaces=XML_NAMESPACES):
                pass

            tax_domain = [
                *self.env['account.tax']._check_company_domain(self.env.company),
                ('type_tax_use', '=', 'purchase'),
                ('price_include', '=', simplified),
            ]
            if l10n_hu_tax_type:
                tax_domain.append(('l10n_hu_tax_type', '=', l10n_hu_tax_type))
            if rate:
                tax_domain.append(('amount', '=', float(rate) * 100))
            if tax := self.env['account.tax'].search(tax_domain, limit=1):
                line_vals['tax_ids'] = [Command.set([tax.id])]

            lines_vals.append(Command.create(line_vals))

        move_vals['invoice_line_ids'] = lines_vals

        return move_vals

# TODO
        # if invoice_category == 'AGGREGATE':
        #     self.message_post(body=_(
        #         "This is an aggregate invoice covering time period from %(start)s to %(end)s.",
        #         start=invoice_detail.findtext('data:invoiceDeliveryPeriodStart', namespaces=XML_NAMESPACES),
        #         end=invoice_detail.findtext('data:invoiceDeliveryPeriodEnd', namespaces=XML_NAMESPACES),
        #     ))

    # def _l10n_hu_edi_check_amounts_mismatch(self, invoice_summary, simplified, gross_total):
    #     self.ensure_one()

    #     if not simplified:
    #         net_amount = float(invoice_summary.findtext('data:summaryNormal/data:invoiceNetAmount', namespaces=XML_NAMESPACES))
    #         vat_amount = float(invoice_summary.findtext('data:summaryNormal/data:invoiceVatAmount', namespaces=XML_NAMESPACES))
    #         gross_total = net_amount + vat_amount

    #     currency = self.currency_id or self.company_id.currency_id
    #     if currency.compare_amounts(gross_total, -self.amount_total_in_currency_signed) != 0:
    #         self.l10n_hu_edi_messages = {
    #             'error_title': _("Amount mismatch detected."),
    #             'errors': [_("The gross total on the bill received from NAV and computed is not the same. Please check XML file in 'NAV 3.0' tab.")],
    #             'blocking_level': 'warning',
    #         }
