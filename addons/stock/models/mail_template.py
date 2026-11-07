from odoo import models


class MailTemplate(models.Model):
    _inherit = 'mail.template'

    _stock__mail_template_data_delivery_confirmation = models.Ref('stock.mail_template_data_delivery_confirmation', 'mail.template', required=False)
