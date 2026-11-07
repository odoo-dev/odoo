from odoo import models


class MailMessageSubtype(models.Model):
    _inherit = 'mail.message.subtype'

    _website_slides__mt_channel_slide_published_optional = models.Ref('website_slides.mt_channel_slide_published', 'mail.message.subtype', required=False)
    _mail__mt_comment_optional = models.Ref('mail.mt_comment', 'mail.message.subtype', required=False)
