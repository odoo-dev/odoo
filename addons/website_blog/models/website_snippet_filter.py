# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields
from odoo.osv import expression


class WebsiteSnippetFilter(models.Model):
    _inherit = 'website.snippet.filter'

    def _get_hardcoded_sample(self, model):
        if model and model.model == 'blog.post':
            return []
        return super()._get_hardcoded_sample(model)

    def _get_blog_posts(self, website, order, context):
        order = order or 'published_date desc'
        limit = context.get('limit')
        search_domain = context.get('search_domain')
        domain = expression.AND([
            [('website_published', '=', True), ('post_date', '<=', fields.Datetime.now())],
            website.website_domain(),
            search_domain or [],
            [['visits', '!=', False]] if 'visits' in order else [],
        ])
        return self.env['blog.post'].search(domain, limit=limit, order=order)
