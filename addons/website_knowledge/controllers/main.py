# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http
from odoo.http import request
from odoo.addons.knowledge.controllers.main import KnowledgeController


class KnowledgeWebsiteController(KnowledgeController):
    # Override
    @http.route('/article/<int:article_id>', type='http', auth='public', website=True)
    def redirect_to_article(self, **kwargs):
        return super().redirect_to_article(**kwargs)

    def _check_access(self, article):
        """ As website_published articles are available for public users, only use user_has_access
        to access the article. """
        return article.user_has_access

    def get_tree_values(self, res_id=False, parent_id=False, unfolded_articles=False):
        """ Override to deactivate the favourite section for public users."""
        values = super(KnowledgeWebsiteController, self).get_tree_values(
            res_id=res_id, parent_id=parent_id, unfolded_articles=unfolded_articles)
        if request.env.user._is_public():
            values["favourites"] = False
        return values
