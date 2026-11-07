from odoo import models


class MailTemplate(models.Model):
    _inherit = 'mail.template'

    _website_sale__mail_template_sale_cart_recovery = models.Ref('website_sale.mail_template_sale_cart_recovery', 'mail.template', required=False)
