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

    @http.route('/article/<int:article_id>/invite/<int:partner_id>', type='http', auth='public')
    def article_invite(self, article_id, partner_id, **post):
        article = request.env['knowledge.article'].browse(article_id)
        if not article.exists():
            return werkzeug.exceptions.NotFound()  # (or BadRequest ?)

        partner = article.sudo().article_member_ids.partner_id.filtered(lambda p: p.id == partner_id)
        if not partner:
            raise werkzeug.exceptions.Forbidden()

        if not partner.user_ids:
            partner.signup_get_auth_param()
            signup_url = partner._get_signup_url_for_action(url='/article/%s' % article_id)[partner.id]
            return redirect(signup_url)

        return redirect('/web/login?redirect=/article/%s' % article_id)

    @http.route('/article/<int:article_id>', type='http', auth='user')
    def redirect_to_article(self, article_id, **post):
        article = request.env['knowledge.article'].browse(article_id)
        if not article.exists():
            return werkzeug.exceptions.NotFound()  # (or BadRequest ?)
        # check if user is logged in
        user = request.env.user
        # for external_users, need to sudo to access article.user_has_access and other fields needed to render the page.
        article = article.sudo()
        if user._is_public() or not article.user_has_access:
            raise werkzeug.exceptions.Forbidden()
        if user.has_group('base.group_user'):
            return redirect("/web#id=%s&model=knowledge.article&action=%s&menu_id=%s" % (
                article.id,
                request.env.ref('knowledge.knowledge_article_dashboard_action').id,
                request.env.ref('knowledge.knowledge_menu_root').id
            ))
        return request.render('knowledge.knowledge_article_view_frontend', self._prepare_article_frontend_values(article, **post))

    def _prepare_article_frontend_values(self, article, **post):
        values = {'article': article}
        values.update(self.get_tree_values(article.id))
        return values

    # ---------------------------
    # Frontend action controllers
    # ---------------------------

    @http.route('/article/toggle_favourite', type='json', auth='user')
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

    def get_tree_values(self, res_id=False, parent_id=False, unfolded_articles=False):
        # sudo article to avoid access error on member or on article for external users.
        # The article the user can see will be based on user_has_access.
        Article = request.env["knowledge.article"].sudo()

        main_articles = Article.search([("parent_id", "=", parent_id), ('user_has_access', '=', True)]).sorted('sequence')
        if parent_id:
            return {'articles': main_articles}

        values = {
            "active_article_id": res_id,
            "public_articles": main_articles.filtered(lambda article: article.category == 'workspace'),
            "shared_articles": main_articles.filtered(lambda article: article.category == 'shared'),
            "unfolded_articles": unfolded_articles,
            "favourites": request.env['knowledge.article.favourite'].sudo().search([
                ("user_id", "=", request.env.user.id), ('article_id.user_has_access', '=', True)
            ])
        }

        if request.env.user.has_group('base.group_user'):
            values['private_articles'] = main_articles.filtered(lambda article: article.owner_id == request.env.user)
        else:
            values['hide_private'] = True

        return values

    @http.route('/knowledge/get_favourite_tree', type='json', auth='user')
    def get_favourite_tree(self, res_id=False):
        favourite_articles = request.env['knowledge.article.favourite'].search([("user_id", "=", request.env.user.id), ('article_id.user_has_access', '=', True)])
        return request.env['ir.qweb']._render('knowledge.article_favourite_section_template', {'favourites': favourite_articles, "active_article_id": res_id})

    @http.route('/knowledge/get_favourite_tree_frontend', type='json', auth='user')
    def get_favourite_tree_frontend(self, res_id=False):
        favourite_articles = request.env['knowledge.article.favourite'].sudo().search([("user_id", "=", request.env.user.id), ('article_id.user_has_access', '=', True)])
        return request.env['ir.qweb']._render('knowledge.knowledge_article_frontend_favourite_tree_template', {'favourites': favourite_articles})

    @http.route('/knowledge/get_tree', type='json', auth='user')
    def display_tree(self, res_id=False, unfolded_articles=False):
        parent_articles = request.env["knowledge.article"].sudo().browse(res_id)._get_parents().ids
        if not unfolded_articles:
            unfolded_articles = []
        unfolded_articles = set(unfolded_articles) | set(parent_articles)
        template = request.env['ir.qweb']._render('knowledge.knowledge_article_tree_template', self.get_tree_values(res_id=res_id, unfolded_articles=unfolded_articles))
        return {"template": template, "unfolded_articles": ";".join(str(id) for id in unfolded_articles)}

    @http.route('/knowledge/get_children', type='json', auth='user')
    def display_children(self, parent_id):
        template = request.env['ir.qweb']._render('knowledge.articles_template', self.get_tree_values(parent_id=parent_id))
        return template

    # ------------------------
    # Article permission panel
    # ------------------------

    @http.route('/knowledge/get_article_permission_panel_data', type='json', auth='user')
    def get_article_permission_panel_data(self, article_id):
        """
        Returns a dictionnary containing all values required to render the permission panel.
        :param article_id: (int) article id
        """
        article = request.env['knowledge.article'].sudo().browse(article_id)
        members = []
        for member in article.article_member_ids:
            member_values = {
                'id': member.id,
                'partner_id': member.partner_id.id,
                'partner_name': member.partner_id.name,
                'permission': member.permission,
                'has_higher_permission': member.has_higher_permission,
                'user_ids': member.partner_id.user_ids.mapped('id'),
                'is_external': not member.partner_id.user_ids
            }
            # Optional values:
            if member.partner_id.company_name:
                member_values['company_name'] = member.partner_id.company_name
            members.append(member_values)
        internal_permission_field = request.env['knowledge.article']._fields['internal_permission']
        permission_field = request.env['knowledge.article.member']._fields['permission']
        return {
            'internal_permission_options': internal_permission_field.get_description(request.env).get('selection', []),
            'internal_permission': article.internal_permission,
            'members_options': permission_field.get_description(request.env).get('selection', []),
            'members': members
        }

    @http.route('/article/set_member_permission', type='json', auth='user')
    def article_set_member_permission(self, article_id, member_id, permission, **post):
        """
        Sets the permission of the given member for the given article.
        **Note**: The user needs "write" permission to change the permission of a user.
        :param article_id: (int) article id
        :param member_id: (int) member id
        :param permission: (string) permission
        """
        article = request.env['knowledge.article'].sudo().browse(article_id)
        previous_category = article.category
        if not article.exists() or not article._set_member_permission(member_id, permission):
            return {'success': False}
        result = {'success': True}
        if article.category != previous_category:
            result['reload_tree'] = True
        return result

    @http.route('/article/remove_member', type='json', auth='user')
    def article_remove_member(self, article_id, member_id):
        """
        Removes the given member from the given article.
        The function returns a dictionary indicating whether the request succeeds (see: `success` key).
        The dictionary can also include a `reload_tree` entry that will signify the caller that the aside block
        listing all articles should be reloaded. This can happen when the article moves from one section to another.
        **Note**: The user needs "write" permission to remove another member from
        the list. The user can always remove themselves from the list.
        :param article_id: (int) article id
        :param member_id: (int) member id
        """
        article = request.env['knowledge.article'].sudo().browse(article_id)
        previous_category = article.category
        if not article.exists() or not article._remove_member(member_id):
            return {'success': False}
        result = {'success': True}
        if article.category != previous_category:
            result['reload_tree'] = True
        return result

    @http.route('/article/set_internal_permission', type='json', auth='user')
    def article_set_internal_permission(self, article_id, permission, **post):
        """
        Sets the internal permission of the given article.
        The function returns a dictionary indicating whether the request succeeds (see: `success` key).
        The dictionary can also include a `reload_tree` entry that will signify the caller that the aside block
        listing all articles should be reloaded. This can happen when the article moves from one section to another.
        **Note**: The user needs "write" permission to update the internal permission of the article.
        :param article_id: (int) article id
        :param permission: (string) permission
        """
        article = request.env['knowledge.article'].sudo().browse(article_id)
        previous_category = article.category
        if not article._set_internal_permission(permission):
            return {'success': False}
        result = {'success': True}
        if article.category != previous_category:
            result['reload_tree'] = True
        return result
