from odoo import models


class MailTemplate(models.Model):
    _inherit = 'mail.template'

    _survey__mail_template_certification = models.Ref('survey.mail_template_certification', 'mail.template')
