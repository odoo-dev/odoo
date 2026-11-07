from odoo import models


class UtmSource(models.Model):
    _inherit = 'utm.source'

    _im_livechat__utm_source_chatbot = models.Ref('im_livechat.utm_source_chatbot')
