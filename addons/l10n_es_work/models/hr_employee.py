# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models
from odoo.exceptions import ValidationError


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    l10n_es_irpf_rate = fields.Float(
        string="IRPF Withholding Rate (%)",
        digits=(5, 2),
        groups='hr.group_hr_user',
        help="Personal IRPF withholding rate, as a positive percentage (e.g. 12.37). It replaces the percentage "
             "of the salary withholding taxes flagged with 'Use employee IRPF rate' on the journal items of "
             "this employee.",
    )

    @api.constrains('l10n_es_irpf_rate')
    def _check_l10n_es_irpf_rate(self):
        for employee in self:
            if not 0.0 <= employee.l10n_es_irpf_rate <= 100.0:
                raise ValidationError(self.env._("The IRPF withholding rate must be between 0 and 100."))