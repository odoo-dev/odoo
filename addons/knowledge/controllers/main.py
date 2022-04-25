# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import werkzeug
from werkzeug.utils import redirect

from odoo import http
from odoo.http import request


class KnowledgeController(http.Controller):

    # ------------------------
    # Article Access Routes
    # ------------------------

    @http.route('/knowledge/article/invite/<int:member_id>/<string:invitation_hash>', type='http', auth='public')
    def article_invite(self, member_id, invitation_hash):
        """ This route will check if the given parameter allows the client to access the article via the invite token.
        Then, if the partner has not registered yet, we will redirect the client to the signup page to finally redirect
        them to the article.
        If the partner already has registrered, we redirect them directly to the article.
        """
        member = request.env['knowledge.article.member'].sudo().browse(member_id).exists()
        if member and member._get_invitation_hash() != invitation_hash:
            raise werkzeug.exceptions.Forbidden()

        partner = member.partner_id
        article = member.article_id

        if not partner.user_ids:
            # Force the signup even if not enabled (as we explicitly invited the member).
            # They should still be able to create a user.
            signup_allowed = request.env['res.users']._get_signup_invitation_scope() == 'b2c'
            if not signup_allowed:
                partner.signup_prepare()
            partner.signup_get_auth_param()
            signup_url = partner._get_signup_url_for_action(url='/knowledge/article/%s' % article.id)[partner.id]
            return redirect(signup_url)

        return redirect('/web/login?redirect=/knowledge/article/%s' % article.id)

    @http.route('/knowledge/article/<int:article_id>', type='http', auth='user')
    def redirect_to_article(self, article_id):
        """ This route will redirect internal users to the backend view of the article and the share users to the
        frontend view instead."""
        article = request.env['knowledge.article'].browse(article_id)
        if not article.exists():
            return werkzeug.exceptions.NotFound()  # (or BadRequest ?)
        current_user = request.env.user
        # for external_users, need to sudo to access article.user_has_access and other fields needed to render the page.
        article = article.sudo()
        if current_user._is_public() or not article.user_has_access:
            raise werkzeug.exceptions.Forbidden()
        if current_user.has_group('base.group_user'):
            return redirect("/web#id=%s&model=knowledge.article&action=%s&menu_id=%s" % (
                article.id,
                request.env["ir.actions.actions"]._for_xml_id("knowledge.knowledge_article_dashboard_action").id,
                request.env.ref('knowledge.knowledge_menu_root').id
            ))
        return request.render('knowledge.knowledge_article_view_frontend', self._prepare_article_values(article))

    def _prepare_article_values(self, article):
        values = {'article': article}
        values.update(self._prepare_articles_tree_values(active_article_id=article.id))
        return values

    # ---------------------------
    # Frontend action controllers
    # ---------------------------

    @http.route('/knowledge/article/toggle_favourite', type='json', auth='user')
    def article_toggle_favourite(self, article_id, **post):
        article = request.env['knowledge.article'].browse(article_id)
        if not article.exists():
            return werkzeug.exceptions.NotFound()
        article = article.sudo()
        if not article.user_has_access:
            return werkzeug.exceptions.Forbidden()
        article.is_user_favourite = not article.is_user_favourite
        return {
            'id': article.id,
            'name': article.display_name,
            'icon': article.icon,
            'is_favourite': article.is_user_favourite,
        }

    # ------------------------
    # Articles tree generation
    # ------------------------

    def _prepare_articles_tree_values(self, active_article_id=False, unfolded_articles=False):
        """
        This method prepares all the info needed to render the templates of the article tree view side panel.
        :param active_article_id: (int) Used to highlight the given article_id in the template
        :param unfolded_articles: (list of ids) Used to display the children of the given article ids.
        :return: (Dict) that will be used to render templates in the articles tree side panel.
        """
        # sudo article to avoid access error on member or on article for external users.
        # The article the user can see will be based on user_has_access.
        root_articles = request.env["knowledge.article"].sudo().search([
            ("parent_id", "=", False), ('user_has_access', '=', True)]
        ).sorted('sequence')

        return {
            "active_article_id": active_article_id,
            "public_articles": root_articles.filtered(lambda article: article.category == 'workspace'),
            "shared_articles": root_articles.filtered(lambda article: article.category == 'shared'),
            "unfolded_articles": unfolded_articles,
            "favourites": request.env['knowledge.article.favourite'].sudo().search([
                ("user_id", "=", request.env.user.id), ('article_id.user_has_access', '=', True)
            ]),
            # private_articles will be empty for share users
            "private_articles": root_articles.filtered(lambda article: article.owner_id == request.env.user)
        }

    @http.route('/knowledge/get_favourite_tree', type='json', auth='user')
    def get_favourite_tree(self, active_article_id=False):
        favourite_articles = request.env['knowledge.article.favourite'].search([("user_id", "=", request.env.user.id), ('article_id.user_has_access', '=', True)])
        return request.env['ir.qweb']._render('knowledge.article_favourite_section_template', {'favourites': favourite_articles, "active_article_id": active_article_id})

    @http.route('/knowledge/get_favourite_tree_frontend', type='json', auth='user')
    def get_favourite_tree_frontend(self, active_article_id=False):
        favourite_articles = request.env['knowledge.article.favourite'].sudo().search([("user_id", "=", request.env.user.id), ('article_id.user_has_access', '=', True)])
        values = {
            'favourites': favourite_articles,
            'active_article_id': active_article_id
        }
        return request.env['ir.qweb']._render('knowledge.knowledge_article_frontend_favourite_tree_template', values)

    @http.route('/knowledge/get_tree', type='json', auth='user')
    def display_tree(self, active_article_id, unfolded_articles=False):
        article = request.env["knowledge.article"].sudo().browse(active_article_id)
        if not article:
            return werkzeug.exceptions.NotFound()
        if not article.user_has_access:
            return werkzeug.exceptions.Forbidden()
        if not unfolded_articles:
            unfolded_articles = []
        unfolded_articles = set(unfolded_articles) | set(article._get_parents().ids)
        return {
            "template": request.env['ir.qweb']._render(
                'knowledge.knowledge_article_tree_template',
                self._prepare_articles_tree_values(
                    active_article_id=active_article_id, unfolded_articles=unfolded_articles
                )
            ),
            "unfolded_articles": list(unfolded_articles)
        }

    @http.route('/knowledge/get_children', type='json', auth='user')
    def display_children(self, parent_id):
        Article = request.env["knowledge.article"].sudo()
        parent = Article.browse(parent_id).exists()
        if not parent:
            return werkzeug.exceptions.NotFound()
        if not parent.user_has_access:
            return werkzeug.exceptions.Forbidden()
        root_articles = Article.search([("parent_id", "=", parent_id), ('user_has_access', '=', True)]).sorted('sequence')
        return request.env['ir.qweb']._render('knowledge.articles_template', {'articles': root_articles})
