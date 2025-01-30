from odoo import fields, models, _


class EsgAssignation(models.Model):
    _name = 'esg.assignation'
    _description = 'Assignation'

    account_id = fields.Many2one('account.account')
    vendor_id = fields.Many2one('res.partner')
    product_id = fields.Many2one('product.product')
    emission_factor_id = fields.Many2one('esg.emission.factor')
