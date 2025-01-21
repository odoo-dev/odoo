from odoo import api, fields, models
from odoo.exceptions import ValidationError

class MerchantCategoryCode(models.Model):
    _name = 'merchant.category.code'
    _description = "Merchant Category Codes"

    name = fields.Char(required=True)
    code_min = fields.Integer(required=True)
    code_max = fields.Integer(required=True)

    @api.depends('code_min', 'code_max')
    def _compute_display_name(self):
        for mcc in self:
            mcc.display_name = f'[{mcc.code_min}-{mcc.code_max}] {mcc.name}'

    @api.constrains('code_min', 'code_max')
    def _check_code_range(self):
        for mcc in self:
            code_min = mcc.code_min
            code_max = mcc.code_max
            if code_min > code_max:
                raise ValidationError(self.env._("The minimum code cannot be greater than the maximum one"))

            other_mcc_codes = self.env['merchant.category.code'].search([('id', '!=', mcc.id)])
            if other_mcc_codes.filtered(lambda other_mcc: (
                code_min <= other_mcc.code_min <= code_max
                or code_min <= other_mcc.code_max <= code_max
            )):
                raise ValidationError(self.env._("Overlapping code ranges"))
