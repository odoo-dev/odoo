from odoo import models


class MailTemplate(models.Model):
    _inherit = 'mail.template'

    _website_event_track__mail_template_data_track_reminder = models.Ref(
        'website_event_track.mail_template_data_track_reminder', 'mail.template', required=False)
