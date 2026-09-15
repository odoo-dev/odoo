from odoo import api, fields, models


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    l10n_fr_border_reference = fields.Char(
        string="Border Reference",
        compute='_compute_octroi_de_mer',
        readonly=False, store=True,
    )
    l10n_fr_rate = fields.Float(
        string="Rate",
        compute='_compute_octroi_de_mer',
        readonly=False, store=True,
    )
    l10n_fr_regional_rate = fields.Float(
        string="Regional rate",
        compute='_compute_octroi_de_mer',
        readonly=False, store=True,
    )

    @api.depends('product_id.l10n_fr_rate_id', 'product_id.l10n_fr_regional_rate_id', 'product_id.l10n_fr_border_reference')
    def _compute_octroi_de_mer(self):
        for line in self:
            if line.product_id:
                line.write({
                    'l10n_fr_border_reference': line.product_id.l10n_fr_border_reference,
                    'l10n_fr_rate': line.product_id.l10n_fr_rate_id.amount,
                    'l10n_fr_regional_rate': line.product_id.l10n_fr_regional_rate_id.amount,
                })
            else:
                line.write({
                    'l10n_fr_border_reference': '',
                    'l10n_fr_rate': 0,
                    'l10n_fr_regional_rate': 0,
                })

    def _compute_tax_ids(self):
        super()._compute_tax_ids()
        for line in self:
            if product := line.product_id:
                line.tax_ids += (product.l10n_fr_rate_id + product.l10n_fr_regional_rate_id)
