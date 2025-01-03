
from odoo import _, models, fields


# https://docs.stripe.com/connect/setting-mcc#list
class ProductMCCSTripeTag(models.Model):
    _name = 'product.mcc.stripe.tag'
    _description = 'Stripe MCC Tag'
    _order = 'code'
    _rec_name = 'code'

    name = fields.Char(string='Name', required=True, translate=True)
    stripe_name = fields.Char(string='Stripe Name', required=True, readonly=True, index='trigram')
    code = fields.Char(string='Code', required=True, readonly=True, size=4, copy=False, index='trigram')

    _code_unique = models.Constraint(
        definition='unique (code)',
        message="The code of the MCC tag must be unique!",
    )
