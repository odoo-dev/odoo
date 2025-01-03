
from odoo import _, models, fields


# https://docs.stripe.com/connect/setting-mcc#list
class ProductMCCSTripeTag(models.Model):
    _name = 'product.mcc.stripe.tag'
    _description = 'Stripe MCC Tag'
    _order = 'code'
    _rec_name = 'code'
    _check_company_auto = True

    def _get_default_product_id(self):
        return self.env.ref('hr_expense.product_product_no_cost', raise_if_not_found=False)

    company_id = fields.Char(required=True, default=lambda self: self.env.company)
    name = fields.Char(string='Name', required=True, translate=True)
    stripe_name = fields.Char(string='Stripe Name', required=True, readonly=True, index='trigram')
    code = fields.Char(string='Code', required=True, readonly=True, size=4, copy=False, index='trigram')
    product_id = fields.Many2one(comodel_name='product.product', default=_get_default_product_id, company_dependent=True)

    _code_unique = models.Constraint(
        definition='unique(company_id, code)',
        message="The code of the MCC tag must be unique!",
    )
