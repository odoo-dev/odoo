from odoo import models


class SmsTemplate(models.Model):
    _inherit = 'sms.template'

    _stock_sms__sms_template_data_stock_delivery = models.Ref('stock_sms.sms_template_data_stock_delivery', 'sms.template', required=False)
