# -*- coding: utf-8 -*-

import io
import calendar
import datetime

from odoo import fields, http, _

from odoo.http import request
from odoo.tools.misc import xlwt

from odoo.addons.web.controllers.main import content_disposition


class ExportXLS(http.Controller):

    def export_xls(self, first_row_data, second_row_data, third_row_data, gstr_type, datas):
        workbook = xlwt.Workbook()
        worksheet = workbook.add_sheet(gstr_type)
        self.style_header = xlwt.easyxf('pattern: pattern solid, fore_colour light_blue; font: colour white, height 250; align: horiz center')
        worksheet.write(0, 0, _('Summary for %s') % str(gstr_type).upper(), self.style_header)
        for colm_index, value in enumerate(first_row_data):
            worksheet.write(1, colm_index, value, self.style_header)
            worksheet.col(colm_index).width = 8000
        for colm_index,  value in enumerate(second_row_data):
            worksheet.write(2, colm_index, value)
        for colm_index,  value in enumerate(third_row_data):
            style_header = xlwt.easyxf('pattern: pattern solid, fore_colour tan; font: height 250; align: horiz center')
            worksheet.write(3, colm_index, value, style_header)
            worksheet.col(colm_index).width = 8000
        for row_index, data in enumerate(datas):
            for colm_index, colm_data  in enumerate(data):
                worksheet.write(4+row_index, colm_index, colm_data)

        fp = io.BytesIO()
        workbook.save(fp)
        fp.seek(0)
        data = fp.read()
        fp.close()
        return data

    def change_date_to_other_format(self, str_date):
        return str_date and fields.Date.from_string(str_date).strftime('%d-%b-%Y') or ''

    def column_total_value_sum(self, column_no):
        if column_no <= 0:
            return ""
        column_string = ""
        while column_no > 0:
            column_no, remainder = divmod(column_no - 1, 26)
            column_string = chr(65 + remainder) + column_string
        return xlwt.Formula("SUM({0}5:{0}19999)".format(column_string))

    @http.route(['/xls/download/<string:month>/<string:year>/<string:gstr_type>/<float:advance_rate>'], type='http', auth='public')
    def download_xls_report(self, month=None, year=None, gstr_type=None, advance_rate=0, **post):
        invoice_data = []

        _, num_days = calendar.monthrange(int(year), int(month))
        first_day = datetime.date(int(year), int(month), 1)
        last_day = datetime.date(int(year), int(month), num_days)
        pre_gst_date = datetime.date(2017, 7, 1)
        #Get value from account settings
        IrConfigSudo = request.env['ir.config_parameter'].sudo()
        b2cs_amount = IrConfigSudo.get_param('l10n_in.l10n_in_b2cs_max_amount') or 250000
        domain = [('date_invoice', '>=' , first_day), ('date_invoice', '<=', last_day), ('state', 'in', ['open', 'paid'])]

        if gstr_type == 'b2b':
            first_row_data = ['No. of Recipients','', 'No. of Invoices', '', 'Total Invoice Value', '', '', '', '', '', 'Total Taxable Value', 'Total Cess']
            second_row_data = ['', '', '', '', self.column_total_value_sum(5), '', '', '', '', '', self.column_total_value_sum(11), self.column_total_value_sum(12)]
            third_row_data = ['GSTIN/UIN of Recipient', 'Name of Recipient', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Invoice Type',
            'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount']
            domain += [('journal_id.code','=','INV'), ('type', '=', 'out_invoice'), ('partner_id.vat', '!=', False)]
            invoices = request.env['account.invoice'].search(domain)
            for invoice in invoices:
                for rate, value in invoice._invoice_line_group_tax_values().items():
                    invoice_data.append((invoice.partner_id.vat, invoice.partner_id.name or '', invoice.number, self.change_date_to_other_format(invoice.date_invoice), invoice.amount_total, invoice.partner_id.state_id.name_with_tin_number(), 'N',
                        'Regular', '', rate, sum(value.get('base_amount')), sum(value.get('cess_amount'))))

        if gstr_type == 'b2cl':
            first_row_data = ['No. of Invoices', '', 'Total Inv Value', '', '', 'Total Taxable Value', 'Total Cess', '']
            second_row_data = ['', '', self.column_total_value_sum(3), '', '', self.column_total_value_sum(6), self.column_total_value_sum(7), '']
            third_row_data = ['Invoice Number', 'Invoice Date', 'Invoice Value', 'Place Of Supply', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN']
            domain += [('amount_total', '>', b2cs_amount), ('journal_id.code','=','RET'), ('type', '=', 'out_invoice')]
            invoices = request.env['account.invoice'].search(domain)
            for invoice in invoices:
                for rate, value in invoice._invoice_line_group_tax_values().items():
                    invoice_data.append((invoice.number, self.change_date_to_other_format(invoice.date_invoice), invoice.amount_total, invoice.partner_id.state_id.name_with_tin_number(), rate, sum(value.get('base_amount')), sum(value.get('cess_amount')), ''))

        if gstr_type == 'b2cs':
            first_row_data = ['', '', '', 'Total Taxable  Value', 'Total Cess', '']
            second_row_data = ['', '', '', self.column_total_value_sum(4), self.column_total_value_sum(5), '']
            third_row_data = ['Type', 'Place Of Supply', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN']
            domain += [('amount_total', '<=', b2cs_amount), ('journal_id.code','=','RET'), ('type', '=', 'out_invoice')]
            invoices = request.env['account.invoice'].search(domain)
            for invoice in invoices:
                for rate, value in invoice._invoice_line_group_tax_values().items():
                    invoice_data.append(('OE', invoice.partner_id.state_id.name_with_tin_number(),
                                            rate, sum(value.get('base_amount')), sum(value.get('cess_amount')), ''))

        if gstr_type == 'cdnr':
            first_row_data = ['No. of Recipients','', 'No. of Invoices', '', 'No. of Notes/Vouchers', '', '', '', '', 'Total Note/Refund Voucher Value', '', 'Total Taxable Value', 'Total Cess', '']
            second_row_data = ['','', '', '', '', '', '', '', '', self.column_total_value_sum(10), '', self.column_total_value_sum(12), self.column_total_value_sum(13), '']
            third_row_data = ['GSTIN/UIN of Recipient','Name of Recipient', 'Invoice/Advance Receipt Number', 'Invoice/Advance Receipt date', 'Note/Refund Voucher Number', 'Note/Refund Voucher date', 'Document Type', 'Reason For Issuing document',
            'Place Of Supply', 'Note/Refund Voucher Value', 'Rate', 'Taxable Value', 'Cess Amount', 'Pre GST']
            domain += [('type', '=', 'out_refund'), ('journal_id.code','=','INV'), ('partner_id.vat', '!=', False)]
            invoices = request.env['account.invoice'].search(domain)
            for invoice in invoices:
                pre_gst = 'Y' if pre_gst_date > fields.Date.from_string(invoice.date_invoice) else 'N'
                for rate, value in invoice._invoice_line_group_tax_values().items():
                    invoice_data.append((invoice.partner_id.vat, invoice.partner_id.name or '', invoice.refund_invoice_id.number or '', self.change_date_to_other_format(invoice.refund_invoice_id.date_invoice), invoice.number or '', self.change_date_to_other_format(invoice.date_invoice), 'C', invoice.refund_reason_id.display_name or '', invoice.partner_id.state_id.name_with_tin_number(), invoice.amount_total, rate, sum(value.get('base_amount')), sum(value.get('cess_amount')), pre_gst))

        if gstr_type == 'cdnur':
            first_row_data = ['', 'No. of Notes/Vouchers', '', '', 'No. of Invoices', '', '', '','Total Note Value', '','Total Taxable Value', 'Total Cess', '']
            second_row_data = ['', '', '', '', '', '', '', '', self.column_total_value_sum(9), '', self.column_total_value_sum(11), self.column_total_value_sum(12), '']
            third_row_data = ['UR Type', 'Note/Refund Voucher Number', 'Note/Refund Voucher date', 'Document Type', 'Invoice/Advance Receipt Number', 'Invoice/Advance Receipt date', 'Reason For Issuing document',
            'Place Of Supply', 'Note/Refund Voucher Value', 'Rate', 'Taxable Value', 'Cess Amount', 'Pre GST']
            domain += [('type', '=', 'out_refund'), ('journal_id.code','in',('RET','EXP'))]
            invoices = request.env['account.invoice'].search(domain)
            for invoice in invoices:
                pre_gst = 'Y' if pre_gst_date > fields.Date.from_string(invoice.date_invoice) else 'N'
                ur_type = invoice.tax_line_ids and 'WPAY' or 'WOPAY' if invoice.journal_id.code == 'EXP'  else 'B2CL'
                for rate, value in invoice._invoice_line_group_tax_values().items():
                    invoice_data.append((ur_type, invoice.refund_invoice_id.number, self.change_date_to_other_format(invoice.refund_invoice_id.date_invoice), 'C', invoice.number, self.change_date_to_other_format(invoice.date_invoice), invoice.refund_reason_id.display_name or '', invoice.partner_id.state_id.name_with_tin_number(), invoice.amount_total, rate, sum(value.get('base_amount')), sum(value.get('cess_amount')), pre_gst))

        if gstr_type == 'exp':
            first_row_data = ['', 'No. of Invoices', '', 'Total Invoice Value', '', 'No. of Shipping Bill', '', '', 'Total Taxable Value']
            second_row_data = ['', '', '', self.column_total_value_sum(4), '', '', '', '', self.column_total_value_sum(9)]
            third_row_data = ['Export Type', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Port Code', 'Shipping Bill Number', 'Shipping Bill Date', 'Rate', 'Taxable Value']
            domain += [('journal_id.code','=','EXP'), ('type', '=', 'out_invoice')]
            invoices = request.env['account.invoice'].search(domain)
            for invoice in invoices:
                for rate, value in invoice._invoice_line_group_tax_values().items():
                    invoice_data.append((invoice.tax_line_ids and 'WPAY' or 'WOPAY', invoice.number, self.change_date_to_other_format(invoice.date_invoice), invoice.amount_total_company_signed, invoice.port_code_id.code or '', '', '', rate, sum(value.get('base_amount'))))

        if gstr_type == 'at':
            first_row_data = ['', '', 'Total Advance Received', 'Total Cess']
            second_row_data = ['', '', self.column_total_value_sum(3), self.column_total_value_sum(4)]
            third_row_data = ['Place Of Supply', 'Rate', 'Gross Advance Received', 'Cess Amount']
            payments = request.env['account.payment'].search([('payment_date', '>=', first_day),
                                                              ('payment_date', '<=', last_day),
                                                              ('state', '=', 'posted'), ('payment_type', '=', 'inbound'),
                                                              ('journal_id.type','in',('bank','cash'))])
            pos_group_data = {}
            for payment in payments:
                advance_amount = payment.amount
                for invoice in payment.invoice_ids.filtered(lambda i: i.date_invoice < fields.Date.to_string(last_day)):
                    for invoice_payment in invoice._get_payments_vals():
                        if invoice_payment.get('account_payment_id') == payment.id:
                           advance_amount -= invoice_payment.get('amount') or 0
                if advance_amount > 0.00:
                    pos_group_data.setdefault(payment.partner_id.state_id.name_with_tin_number(), []).append(advance_amount)
            for pos, value in pos_group_data.items():
                invoice_data.append((pos, advance_rate, sum(value), ''))

        if gstr_type == 'atadj':
            first_row_data = ['', '', 'Total Advance Adjusted', 'Total Cess']
            second_row_data = ['', '', self.column_total_value_sum(3), self.column_total_value_sum(4)]
            third_row_data = ['Place Of Supply', 'Rate', 'Gross Advance Adjusted', 'Cess Amount']
            pos_group_data = {}
            domain += [('journal_id.code','in',('RET','INV'))]
            invoices = request.env['account.invoice'].search(domain)
            for invoice in invoices:
                for invoice_payment in invoice._get_payments_vals():
                    if invoice_payment.get('date') < invoice.date_invoice and invoice_payment.get('date') < fields.Date.to_string(first_day):
                        pos_group_data.setdefault(invoice.partner_id.state_id.name_with_tin_number(), []).append(invoice_payment.get('amount') or 0)
            for pos, value in pos_group_data.items():
                invoice_data.append((pos,'',sum(value),''))

        if gstr_type == 'exemp':
            first_row_data = ['', 'Total Nil Rated Supplies', 'Total Exempted Supplies', 'Total Non-GST Supplies']
            second_row_data = ['', self.column_total_value_sum(3), self.column_total_value_sum(4), self.column_total_value_sum(5)]
            third_row_data = ['Description', 'Nil Rated Supplies', 'Exempted (other than nil rated/non GST supply )', 'Non-GST supplies']

        if gstr_type == 'hsn':
            first_row_data = ['No. of HSN', '', '', '', 'Total Value', 'Total Taxable Value', 'Total Integrated Tax', 'Total Central Tax', 'Total State/UT Tax', 'Total Cess']
            second_row_data = ['', '', '', '', self.column_total_value_sum(5), self.column_total_value_sum(6), self.column_total_value_sum(7), self.column_total_value_sum(8), self.column_total_value_sum(9), self.column_total_value_sum(10)]
            third_row_data = ['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount']
            hsn_group_data = {}
            domain += [('journal_id.code','in',('RET','EXP','INV')), ('type', '=', 'out_invoice')]
            invoices = request.env['account.invoice'].search(domain)
            gst_tag = request.env['account.invoice']._get_gst_tag_ids()
            for invoice in invoices:
                for invoice_line_id, line_taxs in invoice._invoice_line_tax_values().items():
                    invoice_line = request.env['account.invoice.line'].browse(invoice_line_id)
                    igst_amount = cgst_amount = sgst_amount = cess_amount = 0
                    for line_tax in line_taxs:
                        igst_amount += line_tax.get('amount') if gst_tag.get('igst_tag_id') in line_tax.get('tag_ids') else 0
                        cgst_amount += line_tax.get('amount') if gst_tag.get('cgst_tag_id') in line_tax.get('tag_ids') else 0
                        sgst_amount += line_tax.get('amount') if gst_tag.get('sgst_tag_id') in line_tax.get('tag_ids') else 0
                        cess_amount += line_tax.get('amount') if gst_tag.get('cess_tag_id') in line_tax.get('tag_ids') else 0
                    if invoice.currency_id != request.env.user.company_id.currency_id:
                        igst_amount = invoice.currency_id.with_context(date=invoice.date_invoice).compute(igst_amount, request.env.user.company_id.currency_id)
                        cgst_amount = invoice.currency_id.with_context(date=invoice.date_invoice).compute(cgst_amount, request.env.user.company_id.currency_id)
                        sgst_amount = invoice.currency_id.with_context(date=invoice.date_invoice).compute(sgst_amount, request.env.user.company_id.currency_id)
                        cess_amount = invoice.currency_id.with_context(date=invoice.date_invoice).compute(cess_amount, request.env.user.company_id.currency_id)
                    hsn_group_key = (invoice_line.product_id.l10n_in_hsn_code or'' , invoice_line.product_id.l10n_in_hsn_description or '', invoice_line.uom_id.name or '')
                    hsn_group_data.setdefault(hsn_group_key,{}).update({
                            'hsn_code':invoice_line.product_id.l10n_in_hsn_code or'',
                            'hsn_description':invoice_line.product_id.l10n_in_hsn_description or '',
                            'uom':invoice_line.uom_id.name or '',
                            'quantity': [invoice_line.quantity] + (hsn_group_data[hsn_group_key].get('quantity') or []),
                            'price_total': [invoice_line.price_total] + (hsn_group_data[hsn_group_key].get('price_total') or []),
                            'taxable_value':[invoice_line.price_subtotal_signed] + (hsn_group_data[hsn_group_key].get('taxable_value') or []),
                            'igst': [igst_amount] + (hsn_group_data[hsn_group_key].get('igst') or []),
                            'cgst': [cgst_amount] + (hsn_group_data[hsn_group_key].get('cgst') or []),
                            'sgst': [sgst_amount] + (hsn_group_data[hsn_group_key].get('sgst') or []),
                            'cess': [cess_amount] + (hsn_group_data[hsn_group_key].get('cess') or []),
                            })
            for values in hsn_group_data.values():
                invoice_data.append((values['hsn_code'], values['hsn_description'], values['uom'], sum(values['quantity']), sum(values['price_total']), sum(values['taxable_value']), sum(values['igst']), sum(values['cgst']), sum(values['sgst']), sum(values['cess'])))

        if gstr_type == 'docs':
            first_row_data = ['', '', '', 'Total Number', 'Total Cancelled']
            second_row_data = ['', '', '', self.column_total_value_sum(4), self.column_total_value_sum(5)]
            third_row_data = ['Nature  of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled']
            domain += [('state', 'in', ['open', 'paid','cancel']), ('number','!=',False)]


        return http.request.make_response(self.export_xls(first_row_data, second_row_data, third_row_data, gstr_type, invoice_data),
            headers=[('Content-Disposition',
                            content_disposition("GSTR-%s.xls"%(gstr_type.upper()))),
                     ('Content-Type', 'application/vnd.ms-excel')],
            cookies={'fileToken': bytearray()})
