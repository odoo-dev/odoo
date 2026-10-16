from odoo import api, fields, models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    l10n_az_eqf_vat_type = fields.Selection(
        string="EQF VAT Treatment",
        selection=[
            ('taxable', "Subject to VAT"),
            ('zero_rated', "Zero-rated (0%)"),
            ('exempt', "Exempt from VAT"),
            ('non_vat', "Not subject to VAT"),
        ],
        compute='_compute_l10n_az_eqf_vat_type',
        store=True,
        readonly=False,
        help="Column of the Azerbaijani electronic invoice (EQF) in which the lines using this tax are reported.",
    )

    @api.depends('amount_type', 'amount')
    def _compute_l10n_az_eqf_vat_type(self):
        for tax in self:
            tax.l10n_az_eqf_vat_type = 'taxable' if tax.amount_type == 'percent' and tax.amount > 0 else False
