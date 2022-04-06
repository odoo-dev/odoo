# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from werkzeug.urls import url_join

from odoo import fields, models, api


class Article(models.Model):
    _name = 'knowledge.article'
    _inherit = ['knowledge.article', 'website.published.multi.mixin']

    # Override
    @api.depends('user_permission', 'website_published')
    def _compute_user_has_access(self):
        published_articles = self.filtered(lambda article: article.website_published)
        published_articles.user_has_access = True
        super(Article, (self - published_articles))._compute_user_has_access()

    def _get_additional_access_domain(self):
        return [('website_published', '=', True)]
