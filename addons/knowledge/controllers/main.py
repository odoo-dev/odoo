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
        if not self._check_access(article):
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

    def _check_access(self, article):
        """ Check the access of the given article for the current user. """
        return not request.env.user._is_public() and article.user_has_access

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
        Article = request.env['knowledge.article'].sudo()
        Partner = request.env['res.partner']
        article = Article.browse(article_id)
        if not article.user_has_access:
            return werkzeug.exceptions.Forbidden()
        is_sync = not article.is_desynchronized
        # Get member permission info
        members_values = []
        members_permission = article._get_article_member_permissions()[article.id]

        # retrieve all involved partners info
        results = request.env['res.partner'].search_read([('id', 'in', list(members_permission.keys()))], fields=['id', 'name', 'user_ids', 'partner_share'])
        partners_info = {partner['id']: {'name': partner['name'], 'user_ids': partner['user_ids'], 'share': partner['partner_share']} for partner in results}

        # retrieve all member browse records
        members = request.env['knowledge.article.member']
        member_partner_rel = {member["member_id"]: partner_id for partner_id, member in members_permission.items() if partner_id}
        members = request.env['knowledge.article.member'].sudo().browse(list(member_partner_rel.keys())).exists() if member_partner_rel else members

        # retrieve all involved "based on" articles info
        based_on_article_ids = [members_permission[partner_id]['based_on'] for partner_id in partners_info.keys()]
        results = Article.search_read([('id', 'in', based_on_article_ids)], fields=['id', 'display_name', 'share_link'])
        based_on_articles = {article['id']: {'name': article['display_name'], 'link': article['share_link']} for article in results}

        for member in members:
            partner_id = member_partner_rel[member.id]
            permission = members_permission[partner_id]['permission']
            # if share partner and permission = none, don't show it in the permisison panel.
            if permission == 'none' and partners_info[partner_id]['share']:
                continue
            based_on_article = based_on_articles.get(members_permission[partner_id]['based_on'], {})
            # if article is desyncronized, don't show members based on parent articles.
            if not is_sync and based_on_article:
                continue
            user_ids = partners_info[partner_id]['user_ids']
            member_values = {
                'id': member.id,
                'partner_id': partner_id,
                'partner_name': partners_info[partner_id]['name'],
                'permission': permission,
                'based_on': based_on_article.get('name'),
                'based_on_link': based_on_article.get('link'),
                'has_higher_permission': member.has_higher_permission,
                'user_ids': user_ids,
                'is_external': not user_ids
            }
            # Optional values:
            if member.partner_id.company_name:
                member_values['company_name'] = member.partner_id.company_name
            members_values.append(member_values)
        internal_permission_field = request.env['knowledge.article']._fields['internal_permission']
        permission_field = request.env['knowledge.article.member']._fields['permission']
        user_is_admin = request.env.user.has_group('base.group_system')
        return {
            'internal_permission_options': internal_permission_field.get_description(request.env).get('selection', []),
            'internal_permission': article.inherited_permission,
            'parent_permission': article.parent_id.inherited_permission,
            'based_on': article.inherited_permission_parent_id.display_name,
            'based_on_link': article.inherited_permission_parent_id.share_link,
            'members_options': permission_field.get_description(request.env).get('selection', []),
            'members': members_values,
            'is_sync': is_sync,
            'parent_name': article.parent_id.display_name,
            'parent_link': article.parent_id.share_link,
            'user_is_admin': user_is_admin,
            'show_admin_tip': user_is_admin and article.user_permission != 'write',
        }

    @http.route('/article/set_member_permission', type='json', auth='user')
    def article_set_member_permission(self, article_id, permission, member_id=False, partner_id=False, **post):
        """
        Sets the permission of the given member for the given article.
        **Note**: The user needs "write" permission to change the permission of a user.
        :param article_id: (int) article id
        :param permission: (string) permission
        :param member_id: (int) member id
        :param partner_id: (int) partner id. Typically given when the member is based on a parent article.
        """
        article = request.env['knowledge.article'].sudo().browse(article_id)
        if not article.user_can_write:
            return werkzeug.exceptions.Forbidden()
        previous_category = article.category
        if partner_id:  # If based on
            partner = request.env['res.partner'].browse(partner_id).exists()
            if not article or not partner:
                return {'success': False}
            member = request.env['knowledge.article.member'].sudo().browse(member_id).exists()
            downgrade = bool(member) and member.permission > permission
            if (not downgrade and not article.invite_members(partner, permission, send_mail=False))\
                    or (downgrade and not article._desync_access_from_parents(partner.ids, permission)):
                return {'success': False}
        elif not article or not article._set_member_permission(member_id, permission):
            return {'success': False}
        result = {'success': True}
        if article.category != previous_category:
            result['reload_tree'] = True
        return result

    @http.route('/article/remove_member', type='json', auth='user')
    def article_remove_member(self, article_id, member_id, partner_id=False):
        """
        Removes the given member from the given article.
        The function returns a dictionary indicating whether the request succeeds (see: `success` key).
        The dictionary can also include a `reload_tree` entry that will signify the caller that the aside block
        listing all articles should be reloaded. This can happen when the article moves from one section to another.
        **Note**: The user needs "write" permission to remove another member from
        the list. The user can always remove themselves from the list.
        :param article_id: (int) article id
        :param member_id: (int) member id
        :param partner_id: (int) partner id. Typically given when the member is based on a parent article
            and we need to desync the article from its parent (and ensure the partner to removed is well removed
            after the desynchronization).
        """
        article = request.env['knowledge.article'].sudo().browse(article_id)
        if not article.user_can_write:
            return werkzeug.exceptions.Forbidden()
        previous_category = article.category
        if partner_id:  # If the permission is based on parent article -> Desync article
            partner = request.env['res.partner'].browse(partner_id).exists()
            article_member_partners_ids = article.article_member_ids.partner_id.ids
            if not article or not partner or not article._desync_access_from_parents(article_member_partners_ids):
                return {'success': False}
            # remove the partner if was copied from parent
            article.article_member_ids.filtered(lambda m: m.partner_id.id == partner_id).unlink()
        elif not article.exists() or not article._remove_member(member_id):
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
        if not article.user_can_write:
            return werkzeug.exceptions.Forbidden()
        previous_category = article.category
        if not article._set_internal_permission(permission):
            return {'success': False}
        result = {'success': True}
        if article.category != previous_category:
            result['reload_tree'] = True
        return result
