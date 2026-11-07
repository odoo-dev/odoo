from odoo import models


class PaymentProvider(models.Model):
    _inherit = 'payment.provider'

    _payment__payment_provider_demo = models.Ref('payment.payment_provider_demo', required=False)
