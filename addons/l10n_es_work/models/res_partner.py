# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models
from odoo.exceptions import ValidationError


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_es_irpf_rate = fields.Float(
        string="IRPF Withholding Rate (%)",
        digits=(5, 2),
        company_dependent=True,
        groups='account.group_account_invoice,account.group_account_readonly',
        help="Personal IRPF withholding rate, as a positive percentage (e.g. 12.37). When set, it replaces "
             "the percentage of the salary withholding taxes flagged with 'Use partner IRPF rate'. "
             "Leave it empty to apply the percentage of the tax.",
    )

    @api.constrains('l10n_es_irpf_rate')
    def _check_l10n_es_irpf_rate(self):
        for partner in self:
            if not 0.0 <= partner.l10n_es_irpf_rate <= 100.0:
                raise ValidationError(self.env._("The IRPF withholding rate must be between 0 and 100."))
