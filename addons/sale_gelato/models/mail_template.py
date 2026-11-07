from odoo import models


class MailTemplate(models.Model):
    _inherit = 'mail.template'

    _sale_gelato__order_status_update = models.Ref('sale_gelato.order_status_update', 'mail.template')
