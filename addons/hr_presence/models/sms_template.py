from odoo import models


class SmsTemplate(models.Model):
    _inherit = 'sms.template'

    _hr_presence__sms_template_presence = models.Ref('hr_presence.sms_template_presence', required=False)
