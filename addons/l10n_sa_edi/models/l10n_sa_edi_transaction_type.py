from odoo import fields, models


class L10nSaEdiTransactionType(models.Model):
    _name = 'l10n_sa_edi.transaction.type'
    _description = 'ZATCA Transaction Type'

    _l10n_sa_edi__transaction_type_export = models.Ref('l10n_sa_edi.transaction_type_export', required=False)

    name = fields.Char(string="Name", translate=True, required=True)
    code = fields.Selection(
        selection=[
            ('export', 'Export'),
            ('summary', 'Summary'),
            ('nominal', 'Nominal'),
        ],
        string="Code",
        required=True,
    )
