##############################################################################
# For copyright and license notices, see __manifest__.py file in module root
# directory
##############################################################################
from odoo import fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    other_document_type_ids = fields.Many2many(
        'account.document.type',
        'res_partner_document_type_rel',
        'partner_id', 'document_type_id',
        string='Other Documents',
        help='Set here if this partner can issue other documents further '
        'than invoices, credit notes and debit notes',
    )
