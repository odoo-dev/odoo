from odoo import api, fields, models
from odoo.exceptions import ValidationError


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_es_irpf_rate = fields.Float(
        string='Cuota IRPF',
        company_dependent=True,
    )

    @api.constrains('l10n_es_irpf_rate')
    def _check_l10n_es_irpf_rate(self):
        for partner in self:
            if not 0.0 <= partner.l10n_es_irpf_rate <= 100.0:
                raise ValidationError(self.env._("The IRPF withholding rate must be between 0 and 100."))
