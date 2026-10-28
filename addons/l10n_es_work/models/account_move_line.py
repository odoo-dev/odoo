from odoo import api, fields, models
from odoo.tools.sql import column_exists, create_column


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    l10n_es_irpf_rate = fields.Float(
        string="IRPF Rate (%)",
        digits=(5, 2),
        compute='_compute_l10n_es_irpf_rate',
        store=True,
        help="Personal IRPF withholding rate of the partner applied on this journal item. It is kept on the "
             "journal item, so a later change of the partner's rate does not alter this entry.",
    )

    def _auto_init(self):
        if not column_exists(self.env.cr, 'account_move_line', 'l10n_es_irpf_rate'):
            create_column(self.env.cr, 'account_move_line', 'l10n_es_irpf_rate', 'numeric')
        return super()._auto_init()

    @api.depends('partner_id', 'tax_ids')
    def _compute_l10n_es_irpf_rate(self):
        for line in self:
            taxes = line.tax_ids | line.tax_ids.children_tax_ids
            if line.partner_id and taxes.filtered('l10n_es_irpf_partner_rate'):
                line.l10n_es_irpf_rate = line.partner_id.with_company(line.company_id).l10n_es_irpf_rate
            else:
                line.l10n_es_irpf_rate = 0.0
