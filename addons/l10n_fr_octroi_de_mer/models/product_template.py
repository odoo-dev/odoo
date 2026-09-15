from odoo import api, fields, models
from odoo.exceptions import ValidationError


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    l10n_fr_border_reference = fields.Char(string="Border Reference")
    l10n_fr_rate = fields.Float(string="Rate")
    l10n_fr_regional_rate = fields.Float(string="Regional rate")

    @api.constrains('l10n_fr_rate', 'l10n_fr_regional_rate')
    def _check_rates_percentage(self):
        for product_template in self:
            if not 0 <= product_template.l10n_fr_rate <= 100 or not 0 <= product_template.l10n_fr_regional_rate <= 100:
                raise ValidationError(self.env._("The rate should be between 0 and 100%"))
