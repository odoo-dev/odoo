from odoo import fields, models

from odoo.addons.l10n_gr_edi.models.preferred_classification import (
    INVOICE_TYPES_SELECTION,
    PAYMENT_METHOD_SELECTION,
)


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    l10n_gr_edi_default_inv_type = fields.Selection(
        selection=INVOICE_TYPES_SELECTION,
        string="Default MyData Invoice Type",
        help="Default myDATA invoice type to apply on invoices/bills posted on this journal. "
             "It is used as fallback when the partner does not define one.",
    )
    l10n_gr_edi_default_payment_method = fields.Selection(
        selection=PAYMENT_METHOD_SELECTION,
        string="Default MyData Payment Method",
        help="Default myDATA payment method to apply on invoices/bills posted on this journal. "
             "It is used as fallback when the partner does not define one.",
    )
