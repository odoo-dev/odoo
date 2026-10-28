from odoo import api, fields, models


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_es_show_irpf_rate = fields.Boolean(
        compute='_compute_l10n_es_show_irpf_rate',
        help="Technical field: whether a journal item uses a tax taking the partner's IRPF rate.",
    )

    @api.depends('line_ids.tax_ids.l10n_es_irpf_partner_rate')
    def _compute_l10n_es_show_irpf_rate(self):
        for move in self:
            taxes = move.line_ids.tax_ids | move.line_ids.tax_ids.children_tax_ids
            move.l10n_es_show_irpf_rate = bool(taxes.filtered('l10n_es_irpf_partner_rate'))
