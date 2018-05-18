##############################################################################
# For copyright and license notices, see __manifest__.py file in module root
# directory
##############################################################################
from odoo import models, fields


class AccountInvoiceReport(models.Model):
    _inherit = 'account.invoice.report'

    document_type_id = fields.Many2one(
        'account.document.type',
        string='Document Type',
        index=True,
    )

    _depends = {
        'account.invoice': ['document_type_id'],
    }

    def _select(self):
        return super(
            AccountInvoiceReport, self
        )._select() + ", sub.document_type_id as document_type_id"

    def _sub_select(self):
        return super(
            AccountInvoiceReport, self
        )._sub_select() + ", ai.document_type_id as document_type_id"

    def _group_by(self):
        return super(
            AccountInvoiceReport, self
        )._group_by() + ", ai.document_type_id"
