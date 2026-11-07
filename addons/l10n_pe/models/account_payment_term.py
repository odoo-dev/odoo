from odoo import models


class AccountPaymentTerm(models.Model):
    _inherit = 'account.payment.term'

    _account__account_payment_term_end_following_month = models.Ref('account.account_payment_term_end_following_month', required=False)
