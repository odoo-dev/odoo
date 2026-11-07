from odoo import models


class MailTemplate(models.Model):
    _inherit = 'mail.template'

    _auth_signup__mail_template_user_signup_account_created = models.Ref(
        'auth_signup.mail_template_user_signup_account_created', 'mail.template', required=False)
