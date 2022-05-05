# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http
from odoo.http import request
from odoo.addons.knowledge.controllers.main import KnowledgeController


class KnowledgeWebsiteController(KnowledgeController):

    # Override
    @http.route('/knowledge/article/<int:article_id>', type='http', auth='public', website=True)
    def redirect_to_article(self, **kwargs):
        return super().redirect_to_article(**kwargs)

    def _get_root_articles(self, limit=None):
        """ As public users don't have access to article model, get root articles
        in sudo with adapted domain. Public users only have access to website_published
        articles. Other users rely on standard ACLs that include both user_has_access
        and website_published fields. """
        if request.env.user._is_public():
            _order = 'sequence' if limit is not None else None
            return request.env["knowledge.article"].sudo().search(
                [("parent_id", "=", False), ('website_published', '=', True)],
                limit=limit,
                order=_order
            )
        return super()._get_root_articles(limit=limit)
