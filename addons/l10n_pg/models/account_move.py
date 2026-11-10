# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class AccountMove(models.Model):
    _inherit = 'account.move'

    # Shown in the Sales and Supplier listings (GST Act 2003, Section 42 - Tax Invoices).
    l10n_pg_detail_description = fields.Char(
        string="Detail Description",
        help="What the sale or purchase was for, as shown in the Sales and Supplier listings.",
    )
    l10n_pg_document_reference = fields.Char(
        string="Documents Reference",
        help="Type of the supporting document of the purchase (e.g. Tax Invoice, Payment Receipt), as shown in the Supplier listing.",
    )
