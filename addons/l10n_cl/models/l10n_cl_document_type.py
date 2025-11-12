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
    use_documents = fields.Boolean('Use Documents')
    l10n_cl_active = fields.Boolean(  # TODO JOV: why
        'Active in localization', help='This boolean enables document to be included on invoicing')

    country_id = fields.Char('dummy 1')
    internal_type = fields.Char('dummy 2')

    # internal_type_ids = fields.Many2many('account.document.internal.type') TODO JOV: probably remove
    move_domain = fields.Char()

    def _is_doc_type_vendor(self):
        return self.code == '46'

    def _is_doc_type_export(self):
        return self.code in ['110', '111', '112']

    def _is_doc_type_electronic_ticket(self):
        return self.code in ['39', '41']
