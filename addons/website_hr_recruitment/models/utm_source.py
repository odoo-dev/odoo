from odoo import models


class UtmSource(models.Model):
    _inherit = 'utm.source'

    _website_hr_recruitment__utm_source_website_page_generator = models.Ref(
        'website_hr_recruitment.utm_source_website_page_generator', 'utm.source', required=False)
