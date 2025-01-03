from odoo import models


class StripeAuthorization(models.Model):
    _name = 'stripe.authorization'
    _description = 'Stripe Payment Authorization'