# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models, fields


class L10nClDocumentType(models.Model):
    _name = 'l10n_cl.document.type'

    code = fields.Char()
    active = fields.Boolean(default=True)
    name = fields.Char(required=True, help='The document name', translate=True)
    sequence = fields.Integer(default=10, required=True, help='To set in which order show the documents type taking into account the most commonly used first')
    report_name = fields.Char('Name on Reports', help='Name that will be printed in reports, for example "CREDIT NOTE"', translate=True)
    doc_code_prefix = fields.Char('Document Code Prefix')
    internal_type = fields.Selection(
        [
            ('invoice', 'Invoices'),
            ('invoice_in', 'Purchase Invoices'),  # TODO JOV: new
            ('debit_note', 'Debit Notes'),
            ('credit_note', 'Credit Notes'),
            ('receipt_invoice', 'Receipt Invoice'),  # TODO JOV: new
            ('stock_picking', 'Stock Delivery'),  # TODO JOV: new
        ],
    )
    use_documents = fields.Boolean('Use Documents')
    l10n_cl_active = fields.Boolean(  # TODO JOV: why
        'Active in localization', help='This boolean enables document to be included on invoicing')

    # move_type_ids = fields.Many2many() # TODO JOV: an idea

    def _is_doc_type_vendor(self):
        return self.code == '46'

    def _is_doc_type_export(self):
        return self.code in ['110', '111', '112']

    def _is_doc_type_electronic_ticket(self):
        return self.code in ['39', '41']
