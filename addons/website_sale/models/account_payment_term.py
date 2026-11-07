from odoo import models


class AccountPaymentTerm(models.Model):
    _inherit = 'account.payment.term'

    _account__account_payment_term_immediate = models.Ref('account.account_payment_term_immediate', required=False)
