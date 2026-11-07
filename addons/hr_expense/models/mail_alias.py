from odoo import models


class MailAlias(models.Model):
    _inherit = 'mail.alias'

    _hr_expense__mail_alias_expense = models.Ref('hr_expense.mail_alias_expense', required=False)
