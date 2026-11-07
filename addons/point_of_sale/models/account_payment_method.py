from odoo import models


class AccountPaymentMethod(models.Model):
    _inherit = 'account.payment.method'

    _account_iso20022__account_payment_method_sepa_ct_optional = models.Ref('account_iso20022.account_payment_method_sepa_ct', required=False)
