from odoo import models


class SmsTemplate(models.Model):
    _inherit = 'sms.template'

    _calendar_sms__sms_template_data_calendar_reminder = models.Ref('calendar_sms.sms_template_data_calendar_reminder', required=False)
