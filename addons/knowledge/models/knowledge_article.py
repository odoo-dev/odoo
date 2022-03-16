# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import ast
import hashlib
import sys

from collections import defaultdict
from datetime import datetime
from unittest import result
from werkzeug.urls import url_join

from odoo import fields, models, api, _
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.osv import expression
from odoo.tools import get_lang, formataddr


class ArticleFavourites(models.Model):
    _name = 'knowledge.article.favourite'
    _description = 'Favourite Articles'
    _table = 'knowledge_article_favourite_user_rel'
    _order = 'sequence asc'

    article_id = fields.Many2one('knowledge.article', 'Article', required=True, ondelete='cascade')
    user_id = fields.Many2one('res.users', 'User', index=True, required=True, ondelete='cascade')
    sequence = fields.Integer(default=0)

    @api.model_create_multi
    def create(self, vals_list):
        articles = self.env['knowledge.article.favourite']
        for vals in vals_list:
            set_sequence = 'sequence' in vals
            if not set_sequence:
                vals["sequence"] = self._get_max_sequence() + 1

            article = super(ArticleFavourites, self).create(vals)

            if set_sequence:
                self._resequence_favourites(article)
            articles |= article
        return article

    def set_sequence(self, article_id, sequence=False):
        """ Set user sequence of target favourite article."""
        favourite = self.search([('user_id', '=', self.env.user.id), ('article_id', '=', article_id)])
        if not favourite:
            raise UserError(_("You don't have this article in your favourites."))

        # if no given sequence, place the favourite at the end.
        if sequence is False:
            favourite.sequence = self._get_max_sequence() + 1
            return True

        # else: set the sequence + reorder all the following articles
        favourite.sequence = sequence
        self._resequence_favourites(favourite)

    def _resequence_favourites(self, from_favourite):
        start_sequence = from_favourite.sequence + 1
        to_update = self.search([
            ('user_id', '=', self.env.user.id),
            ('sequence', '>=', from_favourite.sequence),
            ('id', '!=', from_favourite.id)])
        for i, favourite in enumerate(to_update):
            favourite.sequence = start_sequence + i

    _sql_constraints = [
        ('unique_favourite', 'unique(article_id, user_id)', 'User already has this article in favourites.')
    ]

    def _get_max_sequence(self):
        max_sequence_favourite = self.search([('user_id', '=', self.env.user.id)], order='sequence desc', limit=1)
        return max_sequence_favourite.sequence + 1 if max_sequence_favourite else -1


class ArticleMembers(models.Model):
    _name = 'knowledge.article.member'
    _description = 'Article Members'
    _table = 'knowledge_article_member_rel'

    article_id = fields.Many2one('knowledge.article', 'Article', ondelete='cascade', required=True)
    partner_id = fields.Many2one('res.partner', index=True, ondelete='cascade', required=True)
    permission = fields.Selection([
        ('none', 'No access'),
        ('read', 'Can read'),
        ('write', 'Can write'),
    ], required=True, default='read')
    # TODO DBE: Make article_permission a related on article_id.inherited_permission
    article_permission = fields.Selection([
        ('none', 'No access'),
        ('read', 'Can read'),
        ('write', 'Can write'),
    ], string="Article Permission", compute='_compute_article_permission', store=True,
        help="This technical field is only used to trigger _check_members constrain")
    has_higher_permission = fields.Boolean(
        compute='_compute_has_higher_permission',
        help="If True, the member has a higher permission then the one set on the article.")

    _sql_constraints = [
        ('partner_unique', 'unique(article_id, partner_id)', 'You already added this partner in this article.')
    ]

    def name_get(self):
        """Override the `name_get` function"""
        return [(rec.id, "%s" % (rec.partner_id.display_name)) for rec in self]

    @api.constrains('article_permission', 'permission')
    def _check_members(self):
        """
        An article must have at least one member. Since this constrain only triggers if we have at least one member on
        the article, another validation is done in 'knowledge.article' model.
        The article_permission related field has been added and stored to force triggering this constrain when
        article.permission is modified.
        """
        parent_members_permission = self.mapped('article_id').mapped('parent_id')._get_article_member_permissions()
        for member in self:
            if member.article_id.inherited_permission != 'write':
                # check on current member article
                article_write_members = member.article_id.article_member_ids.filtered(
                        lambda member: member.permission == 'write')
                if len(article_write_members) > 0:
                    continue
                # check on parents members
                parent_write_members = any(
                    values['permission'] == 'write' for partner_id, values
                    in parent_members_permission[member.article_id.parent_id.id].items()
                    if not member.article_id.is_desynchronized
                    and partner_id not in member.article_id.article_member_ids.mapped('partner_id').ids
                )
                if not parent_write_members:
                    raise ValidationError(_("An article needs at least one member with 'Write' access."))

    @api.constrains('partner_id', 'permission')
    def _check_external_member_permission(self):
        for member in self:
            if member.partner_id.partner_share and member.permission == 'write':
                raise ValidationError(_('An external user cannot have a "write" permission'))

    @api.depends("article_id.internal_permission", "article_id.parent_id")
    def _compute_article_permission(self):
        """ This method and related field is not meant to be used in batch.
        For batch load, use article_id._get_internal_permission() instead."""
        for member in self:
            member.article_permission = member.article_id.inherited_permission

    @api.depends("article_id", "permission")
    def _compute_has_higher_permission(self):
        permission_level = {'none': 0, 'read': 1, 'write': 2}
        articles_permission = self.article_id._get_internal_permission(article_ids=self.article_id.ids)
        for member in self:
            member.has_higher_permission = permission_level[member.permission] > permission_level[articles_permission[member.article_id.ids[0]]]

    @api.ondelete(at_uninstall=False)
    def _unlink_except_no_writer(self):
        """ When removing a member, the constraint is not triggered.
        We need to check manually on article with no write permission that we do not remove the last write member """
        articles = self.article_id
        deleted_members_by_articles = dict.fromkeys(self.article_id.ids, self.env['knowledge.article.member'])
        parent_articles = articles.mapped('parent_id')
        parents_members_permission = parent_articles._get_article_member_permissions()
        for member in self:
            deleted_members_by_articles[member.article_id.id] |= member
        for article in articles:
            # Check article permission
            if article.inherited_permission == 'write':
                continue
            # Check on permission on members
            remaining_members = article.article_member_ids - deleted_members_by_articles[article.id]
            if remaining_members.filtered(lambda m: m.permission == 'write'):
                continue
            # we need to add the members on parents to check the validity
            parent_members_permission = [
                values['permission'] for partner_id, values
                in parents_members_permission[article.parent_id.id].items()
            ] if article.parent_id and not article.is_desynchronized else []

            if not any(permission == 'write' for permission in parent_members_permission):
                raise ValidationError(_("An article needs at least one member with 'Write' access."))

    def _get_invitation_hash(self):
        """ We use a method instead of a field in order to reduce DB space."""
        self.ensure_one()
        return hashlib.sha1(
            (
                str(self.id)
                + fields.Date.to_string(self.create_date)
                + str(self.partner_id)
                + str(self.article_id)
            ).encode("utf-8")
        ).hexdigest()


class Article(models.Model):
    _name = "knowledge.article"
    _description = "Knowledge Articles"
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = "favourite_count, create_date desc"

    active = fields.Boolean(default=True)
    name = fields.Char(string="Title", default="New Article")
    body = fields.Html(string="Article Body")
    icon = fields.Char(string='Article Icon')
    cover = fields.Binary('Cover Image')
    author_ids = fields.Many2many("res.users", string="Authors", default=lambda self: self.env.user)
    is_locked = fields.Boolean(string='Locked', default=False)
    full_width = fields.Boolean(string='Full width', default=False)
    share_link = fields.Char('Link', compute='_compute_share_link', store=False, readonly=True)

    # Hierarchy and sequence
    parent_id = fields.Many2one("knowledge.article", string="Parent Article")
    child_ids = fields.One2many("knowledge.article", "parent_id", string="Child Articles")
    is_desynchronized = fields.Boolean(string="Desyncronized with parents",
                                       help="If set, this article won't inherit access rules from its parents anymore.")
    # Set default=0 to avoid false values and messed up sequence order inside same parent
    sequence = fields.Integer(string="Article Sequence", default=0,
                              help="The sequence is computed only among the articles that have the same parent.")
    main_article_id = fields.Many2one('knowledge.article', string="Highest Parent", recursive=True,
                                      compute="_compute_main_article_id", search="_search_main_article_id")
    subject = fields.Char(string="Subject", related="main_article_id.display_name", store=True, related_sudo=True)

    # Access rules and members + implied category
    internal_permission = fields.Selection([
        ('none', 'No access'),
        ('read', 'Can read'),
        ('write', 'Can write'),
    ], string='Internal Permission', required=False, help="Basic permission for all internal users. External users can still have permissions if they are added to the members.")
    inherited_permission = fields.Selection([
        ('none', 'No access'),
        ('read', 'Can read'),
        ('write', 'Can write'),
    ], string='Article Inherited Permission', compute="_compute_inherited_permission", recursive=True)
    inherited_permission_parent_id = fields.Many2one("knowledge.article", string="Inherited Permission Parent Article",
                                                     compute="_compute_inherited_permission", recursive=True)
    # partner_ids = fields.Many2many("res.partner", string="Article Members", compute="_compute_partner_ids",
    #     inverse="_inverse_partner_ids", search="_search_partner_ids", compute_sudo=True,
    #     help="Article members are the partners that have specific access rules on the related article.")
    article_member_ids = fields.One2many('knowledge.article.member', 'article_id', string='Members Information', copy=True)
    user_has_access = fields.Boolean(string='Has Access', compute="_compute_user_has_access", search="_search_user_has_access")
    user_can_write = fields.Boolean(string='Can Write', compute="_compute_user_can_write", search="_search_user_can_write")
    user_permission = fields.Selection([
        ('none', 'none'),
        ('read', 'read'),
        ('write', 'write')
    ], string='User permission', compute='_compute_user_permission')

    category = fields.Selection([
        ('workspace', 'Workspace'),
        ('private', 'Private'),
        ('shared', 'Shared'),
    ], compute="_compute_category", store=True, compute_sudo=True)
    # If Private, who is the owner ?
    owner_id = fields.Many2one("res.users", string="Current Owner", compute="_compute_owner_id", search="_search_owner_id",
                               help="When an article has an owner, it means this article is private for that owner.")

    # Same as write_uid/_date but limited to the body
    last_edition_id = fields.Many2one("res.users", string="Last Edited by")
    last_edition_date = fields.Datetime(string="Last Edited on")

    # Favourite
    is_user_favourite = fields.Boolean(string="Favourite?", compute="_compute_is_user_favourite",
                                       inverse="_inverse_is_user_favourite", search="_search_is_user_favourite")
    favourite_user_ids = fields.One2many('knowledge.article.favourite', 'article_id', string='Favourite Articles', copy=False)
    # Set default=0 to avoid false values and messed up order
    favourite_count = fields.Integer(string="#Is Favourite", copy=False, default=0)

    @api.constrains('is_desynchronized', 'parent_id')
    def _check_members(self):
        for article in self:
            if article.is_desynchronized and not article.parent_id:
                raise ValidationError(_("A root article cannot be desynchronized."))

    # @api.constrains('internal_permission', 'partner_ids')
    @api.constrains('internal_permission', 'article_member_ids')
    def _check_members(self):
        """ If article has no member, the internal_permission must be write. as article must have at least one writer.
        If article has member, the validation is done in article.member model has we cannot trigger constraint depending
        on fields from related model. see _check_members from 'knowledge.article.member' model for more details.
        Note : We cannot use the optimised sql request to get the permission and members as values are not yet in DB"""
        for article in self:
            def has_write_member(a, child_members=False):
                if not child_members:
                    child_members = self.env['knowledge.article.member']
                article_members = a.article_member_ids
                write_members = article_members.filtered(
                    lambda m: m.permission == 'write' and m.partner_id not in child_members.mapped('partner_id'))
                if write_members:
                    return True
                elif a.parent_id:
                    return has_write_member(a.parent_id, article_members | child_members)
                return False
            if article.inherited_permission != 'write' and not has_write_member(article):
                raise ValidationError(_("An article needs at least one member with 'Write' access."))

    @api.constrains('parent_id')
    def _check_parent_id(self):
        if not self._check_recursion():
            raise ValidationError(_('You cannot create recursive articles.'))

    def name_get(self):
        """Override the `name_get` function to add the article icon"""
        return [(rec.id, "%s %s" % (rec.icon or "📄", rec.name)) for rec in self]

    _sql_constraints = [
        ('check_permission_on_root', 'check(parent_id IS NOT NULL OR (parent_id IS NULL and internal_permission IS NOT NULL))', 'Root articles must have internal permission.')
    ]

    ##############################
    # Computes, Searches, Inverses
    ##############################

    # @api.depends('article_member_ids.partner_id')
    # def _compute_partner_ids(self):
    #     for article in self:
    #         article.partner_ids = article.article_member_ids.partner_id
    #         print("caca")
    #
    # def _inverse_partner_ids(self):
    #     for article in self:
    #         # pre-save value to avoid having _compute_member_ids interfering
    #         # while building membership status
    #         memberships = article.article_member_ids
    #         partners_current = article.partner_ids
    #         partners_new = partners_current - memberships.partner_id
    #
    #         # add missing memberships - default permission will be read.
    #         self.env['knowledge.article.member'].create([{
    #             'article_id': article.id,
    #             'partner_id': partner.id
    #         } for partner in partners_new])
    #
    # def _search_partner_ids(self, operator, value):
    #     return [('article_member_ids.partner_id', operator, value)]

    def _compute_share_link(self):
        for article in self:
            article.share_link = url_join(article.get_base_url(), 'knowledge/article/%s' % article.id)

    @api.depends_context('uid')
    @api.depends('internal_permission', 'article_member_ids.partner_id', 'article_member_ids.permission')
    def _compute_user_permission(self):
        partner_id = self.env.user.partner_id
        article_permissions = self._get_internal_permission(article_ids=self.ids)
        member_permissions = self._get_partner_member_permissions(partner_id.id, article_ids=self.ids)
        for article in self:
            article_id = article.ids[0]
            if self.env.user.share:
                article.user_permission = member_permissions.get(article_id, 'none')
            else:
                article.user_permission = member_permissions.get(article_id, False) or article_permissions[article_id]

    @api.depends('user_permission')
    def _compute_user_has_access(self):
        """ Compute if the current user has access to the article.
        This is done by checking if the user is admin, or checking the internal permission of the article
        and wether the user is member of the article. `.ids[0]` is used to avoid issues with <newId> records
        """
        if self.env.user.has_group('base.group_system'):
            self.user_has_access = True
            return
        if not self.env.user.partner_id:
            self.user_has_access = False
            return
        for article in self:
            article.user_has_access = article.user_permission != 'none'

    @api.depends('user_permission')
    def _compute_user_can_write(self):
        if self.env.user.has_group('base.group_system'):
            self.user_can_write = True
            return
        if not self.env.user.partner_id:
            self.user_can_write = False
            return
        for article in self:
            article.user_can_write = article.user_permission == 'write'

    @api.depends('main_article_id.internal_permission', 'main_article_id.article_member_ids.permission')
    def _compute_category(self):
        for article in self:
            if article.main_article_id.internal_permission != 'none':
                article.category = 'workspace'
            elif len(article.main_article_id.article_member_ids.filtered(lambda m: m.permission != 'none')) > 1:
                article.category = 'shared'
            else:
                article.category = 'private'

    @api.depends_context('uid')
    @api.depends('internal_permission', 'article_member_ids.partner_id', 'article_member_ids.permission')
    def _compute_owner_id(self):
        article_permissions = self._get_internal_permission(article_ids=self.ids)
        member_permissions = self._get_article_member_permissions()
        Partner = self.env['res.partner']
        for article in self:
            members = member_permissions.get(article.id)
            partner = Partner.browse(list(members.keys())[0]) if len(members) == 1 else False
            if article_permissions[article.id] != 'none':
                article.owner_id = False
            elif partner and list(members.values())[0]['permission'] == 'write' and not partner.partner_share and partner.user_ids:
                article.owner_id = next(user for user in partner.user_ids if not user.share)
            else:
                article.owner_id = False

    @api.depends('parent_id')
    def _compute_main_article_id(self):
        for article in self:
            article.main_article_id = article._get_highest_parent()

    def _search_main_article_id(self, operator, value):
        if isinstance(value, str):
            value = self.search([('name', operator, value)]).ids
            if not value:
                return expression.FALSE_DOMAIN
            operator = '='  # now we will search for articles that match the retrieved users.
        elif operator not in ('=', '!=', 'in', 'not in'):
            raise NotImplementedError()
        articles = self
        search_operator = 'in' if operator in ('=', 'in') else 'not in'
        for article in self.search([('id', search_operator, value)]):
            articles |= article._get_descendants()
            articles |= article
        return [('id', 'in', articles.ids)]

    @api.depends('parent_id', 'internal_permission')
    def _compute_inherited_permission(self):
        """ This method and related fields are not meant to be used in batch.
        For batch load, use _get_internal_permission instead."""
        for article in self:
            parent = article
            while parent:
                article_permission = parent.internal_permission
                if article_permission:
                    break
                parent = parent.parent_id
            article.inherited_permission = article_permission
            article.inherited_permission_parent_id = parent if parent != article else False

    def _get_additional_access_domain(self):
        return []

    def _search_user_has_access(self, operator, value):
        if operator not in ('=', '!=') or not isinstance(value, bool):
            raise ValueError("unsupported search operator")

        article_permissions = self._get_internal_permission(check_access=True)

        member_permissions = self._get_partner_member_permissions(self.env.user.partner_id.id)
        articles_with_no_access = [id for id, permission in member_permissions.items() if permission == 'none']
        articles_with_access = [id for id, permission in member_permissions.items() if permission != 'none']

        # If searching articles for which user has access.
        domain = self._get_additional_access_domain()
        if (value and operator == '=') or (not value and operator == '!='):
            if self.env.user.has_group('base.group_system'):
                return expression.TRUE_DOMAIN
            elif self.env.user.share:
                return expression.OR([domain, [('id', 'in', articles_with_access)]])
            return expression.OR([domain, ['|', '&', ('id', 'in', list(article_permissions.keys())), ('id', 'not in', articles_with_no_access),
                         ('id', 'in', articles_with_access)]])
        # If searching articles for which user has NO access.
        domain = [expression.NOT_OPERATOR, domain]
        if self.env.user.has_group('base.group_system'):
            return expression.FALSE_DOMAIN
        elif self.env.user.share:
            return expression.AND([domain, [('id', 'not in', articles_with_access)]])
        return expression.AND([domain, ['|', '&', ('id', 'not in', list(article_permissions.keys())), ('id', 'not in', articles_with_access),
                     ('id', 'in', articles_with_no_access)]])

    def _search_user_can_write(self, operator, value):
        if operator not in ('=', '!=') or not isinstance(value, bool):
            raise ValueError("unsupported search operator")

        article_permissions = self._get_internal_permission(check_write=True)

        member_permissions = self._get_partner_member_permissions(self.env.user.partner_id.id)
        articles_with_no_access = [id for id, permission in member_permissions.items() if permission != 'write']
        articles_with_access = [id for id, permission in member_permissions.items() if permission == 'write']

        # If searching articles for which user has write access.
        if self.env.user.has_group('base.group_system'):
            return expression.TRUE_DOMAIN
        elif self.env.user.share:
            return [('id', 'in', articles_with_access)]
        if (value and operator == '=') or (not value and operator == '!='):
            return ['|', '&', ('id', 'in', list(article_permissions.keys())), ('id', 'not in', articles_with_no_access),
                         ('id', 'in', articles_with_access)]
        # If searching articles for which user has NO write access.
        if self.env.user.has_group('base.group_system'):
            return expression.FALSE_DOMAIN
        elif self.env.user.share:
            return [('id', 'not in', articles_with_access)]
        return ['|', '&', ('id', 'not in', list(article_permissions.keys())), ('id', 'not in', articles_with_access),
                     ('id', 'in', articles_with_no_access)]

    def _search_owner_id(self, operator, value):
        # get the user_id from name
        if isinstance(value, str):
            value = self.env['res.users'].search([('name', operator, value)]).ids
            if not value:
                return expression.FALSE_DOMAIN
            operator = '='  # now we will search for articles that match the retrieved users.
        # Assumes operator is '=' and value is a user_id or False
        elif operator not in ('=', '!='):
            raise NotImplementedError()

        # if value = False and operator = '!=' -> We look for all the private articles.
        domain = [('category', '=' if value or operator == '!=' else '!=', 'private')]
        if value:
            if isinstance(value, int):
                value = [value]
            users_partners = self.env['res.users'].browse(value).mapped('partner_id')
            article_members = self._get_article_member_permissions()
            def filter_on_permission(members, permission):
                for partner_id, member_info in members.items():
                    if member_info['permission'] == permission:
                        yield partner_id

            import logging
            _logger = logging.getLogger(__name__)
            start = datetime.now()
            articles_with_access = [article_id
                                    for article_id, members in article_members.items()
                                    if any(partner_id in filter_on_permission(members, "write")
                                           for partner_id in users_partners.ids)]
            domain = expression.AND([domain, [('id', 'in' if operator == '=' else 'not in', articles_with_access)]])
        return domain

    def _compute_is_user_favourite(self):
        for article in self:
            article.is_user_favourite = self.env.user in article.favourite_user_ids.mapped('user_id')

    def _inverse_is_user_favourite(self):
        favorite_articles = not_fav_articles = self.env['knowledge.article']
        for article in self:
            if self.env.user in article.favourite_user_ids.user_id: # unset as favourite
                not_fav_articles |= article
            else:  # set as favourite
                favorite_articles |= article

        favorite_articles.write({'favourite_user_ids': [(0, 0, {
            'user_id': self.env.user.id,
        })]})
        not_fav_articles.favourite_user_ids.filtered(lambda u: u.user_id == self.env.user).unlink()

        for article in not_fav_articles:
            article.favourite_count -= 1
        for article in favorite_articles:
            article.favourite_count += 1

    def _search_is_user_favourite(self, operator, value):
        if operator != "=":
            raise NotImplementedError("Unsupported search operation on favourite articles")

        if value:
            return [('favourite_user_ids.user_id', 'in', [self.env.user.id])]
        else:
            return [('favourite_user_ids.user_id', 'not in', [self.env.user.id])]

    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        """ Override to support ordering on is_user_favourite.

        Ordering through web client calls search_read with an order parameter set.
        Search_read then calls search. In this override we therefore override search
        to intercept a search without count with an order on is_user_favourite.
        In that case we do the search in two steps.

        First step: fill with current user's favourite results

          * Search articles that are favourite of the current user.
          * Results of that search will be at the top of returned results. Use limit
            None because we have to search all favourite articles.
          * Finally take only a subset of those articles to fill with
            results matching asked offset / limit.

        Second step: fill with other results. If first step does not gives results
        enough to match offset and limit parameters we fill with a search on other
        articles. We keep the asked domain and ordering while filtering out already
        scanned articles to keep a coherent results.

        All other search and search_read are left untouched by this override to avoid
        side effects. Search_count is not affected by this override.
        """
        if count or not order or 'is_user_favourite' not in order:
            return super(Article, self).search(args, offset=offset, limit=limit, order=order, count=count)
        order_items = [order_item.strip().lower() for order_item in (order or self._order).split(',')]
        favourite_asc = any('is_user_favourite asc' in item for item in order_items)

        # Search articles that are favourite of the current user.
        my_articles_domain = expression.AND([[('favourite_user_ids.user_id', 'in', [self.env.user.id])], args])
        my_articles_order = ', '.join(item for item in order_items if 'is_user_favourite' not in item)
        articles_ids = super(Article, self).search(my_articles_domain, offset=0, limit=None, order=my_articles_order, count=count).ids

        # keep only requested window (offset + limit, or offset+)
        my_articles_ids_keep = articles_ids[offset:(offset + limit)] if limit else articles_ids[offset:]
        # keep list of already skipped article ids to exclude them from future search
        my_articles_ids_skip = articles_ids[:(offset + limit)] if limit else articles_ids

        # do not go further if limit is achieved
        if limit and len(my_articles_ids_keep) >= limit:
            return self.browse(my_articles_ids_keep)

        # Fill with remaining articles. If a limit is given, simply remove count of
        # already fetched. Otherwise keep none. If an offset is set we have to
        # reduce it by already fetch results hereabove. Order is updated to exclude
        # is_user_favourite when calling super() .
        article_limit = (limit - len(my_articles_ids_keep)) if limit else None
        if offset:
            article_offset = max((offset - len(articles_ids), 0))
        else:
            article_offset = 0
        article_order = ', '.join(item for item in order_items if 'is_user_favourite' not in item)

        other_article_res = super(Article, self).search(
            expression.AND([[('id', 'not in', my_articles_ids_skip)], args]),
            offset=article_offset, limit=article_limit, order=article_order, count=count
        )
        if favourite_asc in order_items:
            return other_article_res + self.browse(my_articles_ids_keep)
        else:
            return self.browse(my_articles_ids_keep) + other_article_res

    ##########
    #  CRUD  #
    ##########

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            vals['last_edition_id'] = self._uid
            vals['last_edition_date'] = fields.Datetime.now()

        articles = super(Article, self).create(vals_list)
        for article, vals in zip(articles, vals_list):
            if any(field in ['parent_id', 'sequence'] for field in vals) and not self.env.context.get('resequencing_articles'):
                article.with_context(resequencing_articles=True)._resequence()
        return articles

    def write(self, vals):
        """ Add editor as author. Edition means writing on the body. """
        if 'body' in vals:
            vals.update({
                "author_ids": [(4, self._uid)],  # add editor as author.
                "last_edition_id": self._uid,
                "last_edition_date": fields.Datetime.now(),
            })

        result = super(Article, self).write(vals)

        # use context key to stop reordering loop as "_resequence" calls write method.
        if any(field in ['parent_id', 'sequence'] for field in vals) and not self.env.context.get('resequencing_articles'):
            self.with_context(resequencing_articles=True)._resequence()

        return result

    @api.returns('self', lambda value: value.id)
    def copy(self, default=None):
        self = self.sudo()
        default = dict(default or {},
                       name=_("%s (copy)", self.name),
                       sequence=self.sequence+1)
        return super().copy(default=default)

    def unlink(self):
        for article in self:
            # Make all the article's children be adopted by the parent's parent.
            # Otherwise, we will have to manage an orphan house.
            parent = article.parent_id
            if parent:
                article.child_ids.write({"parent_id": parent.id})
        return super(Article, self).unlink()

    #########
    # Actions
    #########

    def action_home_page(self):
        if 'res_id' not in self.env.context:
            article = self.env['knowledge.article.favourite'].search([
                ('user_id', '=', self.env.user.id),
                ('article_id.user_has_access', '=', True)], limit=1).article_id
            if not article:
                article = self.search([
                    ('parent_id', '=', False),
                    ('internal_permission', '!=', 'none')
                ], limit=1, order='sequence')
                if not article:
                    article = self.search([('parent_id', '=', False)], limit=1, order='sequence')
        else:
            article = self.browse(self.env.context['res_id'])
        mode = 'edit' if article.user_can_write else 'readonly'
        action = self.env['ir.actions.act_window']._for_xml_id('knowledge.knowledge_article_dashboard_action')
        action['res_id'] = self.env.context.get('res_id', article.id)
        action['context'] = dict(ast.literal_eval(action.get('context')), form_view_initial_mode=mode)
        return action

    def action_set_lock(self):
        for article in self:
            article.is_locked = True

    def action_set_unlock(self):
        for article in self:
            article.is_locked = False

    def action_toggle_favourite(self):
        article = self.sudo()
        if not article.user_has_access:
            raise AccessError(_("You cannot add this article to your favourites"))
        article.is_user_favourite = not article.is_user_favourite
        return article.is_user_favourite

    def action_archive(self):
        return super(Article, self | self._get_descendants()).action_archive()

    #####################
    #  Business methods
    #####################

    def get_possible_parents(self, term=""):
        # do a search_read and exclude all articles in descendants
        exclude_ids = self._get_descendants()
        exclude_ids |= self
        return self.search_read(
            domain=['&', ['name', '=ilike', '%%%s%%' % term], ['id', 'not in', exclude_ids.ids]],
            fields=['id', 'icon', 'name'],
        )

    def move_to(self, parent_id=False, before_article_id=False, private=False):
        self.ensure_one()
        if not self.user_can_write:
            raise AccessError(_('You are not allowed to move this article.'))
        parent = self.browse(parent_id) if parent_id else False
        if parent and not parent.user_can_write:
            raise AccessError(_('You are not allowed to move this article under this parent.'))
        before_article = self.browse(before_article_id) if before_article_id else False

        # as base user doesn't have access to members, use sudo to allow access it.
        article_sudo = self.sudo()

        if before_article:
            sequence = before_article.sequence
        else:
            # get max sequence among articles with the same parent
            sequence = article_sudo._get_max_sequence_inside_parent(parent_id)

        values = {
            'parent_id': parent_id,
            'sequence': sequence
        }
        if not parent_id:
            # If parent_id, the write method will set the internal_permission based on the parent.
            # If set as root article: if moved to private -> set none; if moved to workspace -> set write
            values['internal_permission'] = 'none' if private else 'write'

        members_to_remove = self.env['knowledge.article.member']
        if not parent and private:  # If set private without parent, remove all members except current user.
            member = article_sudo.article_member_ids.filtered(lambda m: m.partner_id == self.env.user.partner_id)
            if member:
                members_to_remove = article_sudo.article_member_ids.filtered(lambda m: m.id != member.id)
                values.update({
                    'article_member_ids': [(1, member.id, {
                        'permission': 'write'
                    })]
                })
            else:
                members_to_remove = article_sudo.article_member_ids
                values.update({
                    'article_member_ids': [(0, 0, {
                        'partner_id': self.env.user.partner_id.id,
                        'permission': 'write'
                    })]
                })

        article_sudo.write(values)
        members_to_remove.unlink()

        return True

    def article_create(self, title=False, parent_id=False, private=False):
        parent = self.browse(parent_id) if parent_id else False

        if parent:
            if private and parent.category != "private":
                raise ValidationError(_("Cannot create an article under a non-private parent"))
            if not parent.user_can_write:
                raise AccessError(_("Cannot create an article under a parent article you can't write on"))
            if private and not parent.owner_id == self.env.user:
                raise AccessError(_("Cannot create an article under a non-owned private article"))
            private = parent.category == "private"

        values = {
            'parent_id': parent_id,
            'sequence': self._get_max_sequence_inside_parent(parent_id)
        }
        if not parent:
            values.update({
                'internal_permission': 'none' if private else 'write', # you cannot create an article without parent in shared directly.,
            })
        # User cannot write on members, sudo is needed to allow to create a private article or create under a parent user can write on.
        # for article without parent or not in private, access to members is not required to create an article
        if (private or parent) and self.env.user.has_group('base.group_user'):
            self = self.sudo()
        if not parent and private:
            # To be private, the article hierarchy need at least one member with write access.
            values.update({
                'article_member_ids': [(0, 0, {
                    'partner_id': self.env.user.partner_id.id,
                    'permission': 'write'
                })]
            })

        if title:
            values.update({
                'name': title,
                'body': "<h1>" + title + "</h1>",
            })

        article = self.create(values)

        return article.id

    def get_user_sorted_articles(self, search_query, fields, order_by, limit):
        """ Called when using the Command palette to search for articles matching the search_query.
        As the article should be sorted also in function of the current user's favourite sequence, a search_read rpc
        won't be enough to returns the articles in the correct order.
        This method returns a list of article proposal matching the search_query sorted by:
            - is_user_favourite
            - Favourite sequence
            - Favourite count
        and returned result mimic a search_read result structure.
        """
        search_domain = ["|", ("name", "ilike", search_query), ("parent_id.name", "ilike", search_query)]
        articles = self.search(search_domain, order=order_by, limit=limit)

        favourite_articles = articles.filtered(
            lambda a: a.is_user_favourite).sorted(
                key=lambda a: a.favourite_user_ids.filtered(
                    lambda f: f.user_id == self.env.user
                ).sequence)
        sorted_articles = favourite_articles | (articles - favourite_articles)

        # TODO DBE: don't we have something that does that already ?
        def get_field_info(article, field_name):
            field = article._fields[field_name]
            if field.type in ('many2one', 'one2many', 'many2many'):
                rec = article[field_name]
                return [rec.id, rec.display_name] if rec else False
            else:
                return article[field_name]

        return [
            {field: get_field_info(article, field) for field in fields}
            for article in sorted_articles
        ]

    # Permission and members handling methods
    # ---------------------------------------

    def restore_article_access(self):
        """ This method will reset the permissions based on parent articles.
        It will remove all the members except the members on the articles that are not on any parent
        or that have higher permission than from parents."""
        self.ensure_one()
        if not self.parent_id:
            return False
        members_permission = self._get_article_member_permissions()[self.id]
        parents_members_permission = self.parent_id._get_article_member_permissions()[self.parent_id.id]

        members_values = []
        permission_level = {'none': 0, 'read': 1, 'write': 2}
        for partner, values in members_permission.items():
            permission = values['permission']
            if values["based_on"] or partner not in parents_members_permission \
                or permission_level[permission] > permission_level[parents_members_permission[partner]['permission']]:
                continue
            members_values.append((3, values['member_id']))

        return self.write({
            'internal_permission': False,
            'article_member_ids': members_values,
            'is_desynchronized': False
        })

    def _desync_access_from_parents(self, partner_ids=False, member_permission=False, internal_permission=False):
        """ This method will copy all the inherited access from parents on the article, except for the given partner_id,
        in any, in order to de-synchronize the article from its parents in terms of access.
        If member_permission is given, the method will then create a new member for the given partner_id with the given
        permission. """
        self.ensure_one()
        if not partner_ids:
            partner_ids = []
        members_permission = self._get_article_member_permissions()[self.id]
        internal_permission = internal_permission or self.inherited_permission

        members_values = []
        for partner_id, values in members_permission.items():
            # if member already on self, do not add it.
            if not values['based_on'] or values['based_on'] == self.id:
                continue
            if partner_id in partner_ids:
                if member_permission:
                    members_values.append((0, 0, {
                        'partner_id': partner_id,
                        'permission': member_permission
                    }))
                continue
            members_values.append((0, 0, {
                'partner_id': partner_id,
                'permission': values['permission']
            }))

        return self.write({
            'internal_permission': internal_permission,
            'article_member_ids': members_values,
            'is_desynchronized': True
        })

    def _set_internal_permission(self, permission):
        """
        Set the internal permission of the article.
        :param permission (str): permission ('none', 'read' or 'write')
        """
        self.ensure_one()
        if not self.user_can_write:
            return False
        values = {'internal_permission': permission}
        # always add current user as writer if user sets permission != write
        should_invite_self = False
        if self.user_can_write and permission != "write":
            should_invite_self = True
        # when downgrading internal permission on a child article, desync it from parent
        permission_level = {'none': 0, 'read': 1, 'write': 2}
        if not self.is_desynchronized and self.parent_id \
                and permission_level[self.parent_id.inherited_permission] > permission_level[permission]:
            if should_invite_self:
                self._invite_members(self.env.user.partner_id, 'write', send_mail=False)
            return self._desync_access_from_parents(internal_permission=permission)
        # Resyncro Internal permission if we set same permission as parent.
        if permission == self.parent_id.inherited_permission and not self.article_member_ids:
            values.update({
                'internal_permission': False,
                'is_desynchronized': False
            })
        result = self.write(values)
        if should_invite_self:
            self._invite_members(self.env.user.partner_id, 'write', send_mail=False)
        return result

    def _set_member_permission(self, member_id, permission):
        """
        Set the permission of the given member on the article.
        :param member_id (int): member id
        :param permission (str): permission ('none', 'read' or 'write')
        """
        self.ensure_one()
        if not self.user_can_write:
            return False
        member = self.article_member_ids.filtered(lambda member: member.id == member_id)
        return member.write({'permission': permission})

    def _remove_member(self, member_id):
        """
        Remove a member from the article.
        :param member_id (int): member id
        """
        self.ensure_one()
        member = self.article_member_ids.filtered(lambda member: member.id == member_id)
        remove_self, upgrade_self = self.env.user.partner_id == member.partner_id, False
        if remove_self:
            upgrade_self = not member.has_higher_permission
        if not self.user_can_write and upgrade_self:
            return False
        return member.unlink()

    def invite_members(self, partner_ids, permission, send_mail=True):
        """
        Invite new members to the article.
        :param partner_ids (Model<res.partner>): Recordset of res.partner
        :param permission (string): permission ('none', 'read' or 'write')
        :param send_mail (boolean): Flag indicating whether an email should be sent
        """
        self.ensure_one()
        if not self.user_can_write:
            raise AccessError(_("You cannot give access to this article as you are not editor."))
        share_partner_ids = partner_ids.filtered(lambda partner: partner.partner_share)
        article = self.sudo()
        if permission != 'none':
            article._invite_members(share_partner_ids, 'read', send_mail=send_mail)
            article._invite_members(partner_ids - share_partner_ids, permission, send_mail=send_mail)
        else:
            article._invite_members(partner_ids, permission, send_mail=send_mail)
        return True

    def _invite_members(self, partner_ids, permission, send_mail=True):
        """
        :param partner_ids (Model<res.partner>): Recordset of res.partner
        :param permission (string): permission ('none', 'read' or 'write')
        :param send_mail (boolean): Flag indicating whether an email should be sent
        """
        self.ensure_one()
        if not partner_ids:
            return
        members = self.article_member_ids.filtered_domain([('partner_id', 'in', partner_ids.ids)])
        if members:
            members.write({'permission': permission})
        partners = partner_ids - members.mapped('partner_id')
        if not partners:
            return
        self.write({
            'article_member_ids': [(0, 0, {
                'partner_id': partner.id,
                'permission': permission
            }) for partner in partners]
        })
        if permission != 'none' and send_mail:
            for partner in partners:
                self._send_invite_mail(partner)

    def _send_invite_mail(self, partner):
        self.ensure_one()
        subject = _("Invitation to access %s", self.name)
        partner_lang = get_lang(self.env, lang_code=partner.lang).code
        body = self.env['ir.qweb'].with_context(lang=partner_lang)._render('knowledge.knowledge_article_mail_invite', {
            'record': self,
            'user': self.env.user,
            'recipient': partner,
            'link': self._get_invite_url(partner),
        })

        self.with_context(lang=partner_lang).message_notify(
            partner_ids=partner.ids, body=body, subject=subject,
            email_layout_xmlid='mail.mail_notification_light'
        )

    def _get_invite_url(self, partner):
        self.ensure_one()
        member = self.env['knowledge.article.member'].search([('article_id', '=', self.id), ('partner_id', '=', partner.id)])
        return url_join(self.get_base_url(), "/knowledge/article/invite/%s/%s" % (member.id, member._get_invitation_hash()))

    ###########
    #  Tools
    ###########

    def _get_internal_permission(self, article_ids=False, check_access=False, check_write=False):
        """ We don't use domain because we cannot include properly the where clause in the custom sql query.
        The query's output table and fields names does not match the model we are working on"""
        domain = []
        args = []
        if article_ids:
            args = [tuple(article_ids)]
            domain.append("original_id in %s")
        if check_access:
            domain.append("internal_permission != 'none'")
        elif check_write:
            domain.append("internal_permission = 'write'")
        domain = ("WHERE " + " AND ".join(domain)) if domain else ''

        sql = '''WITH RECURSIVE acl as (
                    SELECT id, id as original_id, parent_id, internal_permission
                        FROM knowledge_article
                    UNION
                    SELECT t.id, p.original_id, t.parent_id, COALESCE(p.internal_permission, t.internal_permission)
                        FROM knowledge_article t INNER JOIN acl p
                        ON (p.parent_id=t.id and p.internal_permission is null))
                 SELECT original_id, max(internal_permission)
                    FROM acl
                    %s
                    GROUP BY original_id''' % domain
        self._cr.execute(sql, args)
        return dict(self._cr.fetchall())

    def _get_partner_member_permissions(self, partner_id, article_ids=False):
        """ Retrieve the permission for the given partner for all articles.
        The articles can be filtered using the article_ids param."""
        domain = "WHERE permission is not null"
        args = []
        if article_ids:
            args = [tuple(article_ids)]
            domain += " AND original_id in %s"

        sql = '''WITH RECURSIVE
                    perm as (SELECT a.id, a.parent_id, m.permission
                        FROM knowledge_article a LEFT JOIN knowledge_article_member_rel m
                        ON a.id=m.article_id and partner_id = %s),
                    rec as (
                        SELECT t.id, t.id as original_id, t.parent_id, t.permission
                            FROM perm as t
                        UNION
                        SELECT t1.id, p.original_id, t1.parent_id, COALESCE(p.permission, t1.permission)
                            FROM perm as t1
                            INNER JOIN rec p
                            ON (p.parent_id=t1.id and p.permission is null))
                 SELECT original_id, max(permission)
                    FROM rec
                    %s
                    GROUP BY original_id''' % (partner_id, domain)

        self._cr.execute(sql, args)
        return dict(self._cr.fetchall())

    def _get_article_member_permissions(self):
        """ Retrieve the permission for all the members that apply to the target article.
        Members that apply are not only the ones on the article but can also come from parent articles."""
        domain = "WHERE partner_id is not null"
        args = []
        if self.ids:
            args = [tuple(self.ids)]
            domain += " AND original_id in %s"
        sql = '''WITH RECURSIVE
                    perm as (SELECT a.id, a.parent_id, m.id as member_id, m.partner_id, m.permission
                                    FROM knowledge_article a
                                    LEFT JOIN knowledge_article_member_rel m ON a.id = m.article_id),
                    rec as (
                        SELECT t.id, t.id as original_id, t.parent_id, t.member_id, t.partner_id, t.permission, t.id as origin, 0 as level
                            FROM perm as t
                        UNION
                        SELECT t1.id, p.original_id, t1.parent_id, t1.member_id, t1.partner_id, t1.permission, t1.id as origin, p.level + 1
                            FROM perm as t1
                            INNER JOIN rec p
                            ON (p.parent_id=t1.id))
                SELECT original_id, origin, member_id, partner_id, permission, min(level)
                        FROM rec
                        %s GROUP BY original_id, origin, member_id, partner_id, permission''' % domain

        self._cr.execute(sql, args)
        results = self._cr.fetchall()
        # Now that we have, for each article, all the members found on themselves and their parents.
        # We need to keep only the first partners found (lowest level) for each article
        article_members = defaultdict(dict)
        min_level_dict = defaultdict(dict)
        for result in results:
            [article_id, origin_id, member_id, partner_id, permission, level] = result
            min_level = min_level_dict[article_id].get(partner_id, sys.maxsize)
            if level < min_level:
                article_members[article_id][partner_id] = {
                    'member_id': member_id,
                    'based_on': origin_id if origin_id != article_id else False,
                    'permission': permission
                }
                min_level_dict[article_id][partner_id] = level
        # add empty member for each article that doesn't have any.
        for article in self:
            if article.id not in article_members:
                article_members[article.id][None] = {'based_on': False, 'member_id': False, 'permission': None}

        return article_members

    def _get_max_sequence_inside_parent(self, parent_id):
        # TODO DBE: maybe order the childs_ids in desc on parent should be enough
        max_sequence_article = self.search(
            [('parent_id', '=', parent_id)],
            order="sequence desc",
            limit=1
        )
        return max_sequence_article.sequence + 1 if max_sequence_article else 0

    def _get_highest_parent(self):
        self.ensure_one()
        if self.parent_id:
            return self.parent_id._get_highest_parent()
        else:
            return self

    def _get_descendants(self):
        """ Returns the descendants recordset of the current article. """
        descendants = self.env['knowledge.article']
        for child in self.child_ids:
            descendants |= child
            descendants |= child._get_descendants()
        return descendants

    def _get_parents(self):
        """ Returns the descendants recordset of the current article. """
        parents = self.env['knowledge.article']
        if self.parent_id:
            parents |= self.parent_id
            parents |= self.parent_id._get_parents()
        return parents

    def _resequence(self):
        """ This method re-order the children of the same parent (brotherhood) if needed.
         If an article have been moved from one parent to another, we don't need to resequence the children of the
         old parent as the order remains unchanged. We only need to resequence the children of the new parent only if
         the sequences of the children contains duplicates. When reordering an article, we assume that we always set
         the sequence equals to the position we want it to be, and we use the write_date to differentiate the new order
         between duplicates in sequence.
         So if we want article D to be placed at 3rd position between A B et C: set D.sequence = 2, but C was already 2.
         To know which one is the real 3rd in position, we use the write_date. The last modified is the real 3rd. """
        write_vals_by_sequence = {}
        # Resequence articles with parents
        parents = self.mapped("parent_id")
        for parent in parents:
            children = self.search([("parent_id", '=', parent.id)], order="sequence,write_date desc")
            self._resequence_children(children, write_vals_by_sequence)
        # Resequence articles with no parent
        if any(not article.parent_id for article in self):
            children = self.search([("parent_id", '=', False)], order="sequence,write_date desc")
            self._resequence_children(children, write_vals_by_sequence)

        for sequence in write_vals_by_sequence:
            write_vals_by_sequence[sequence].write({'sequence': sequence})

    def _resequence_children(self, children, write_vals_by_sequence):
        children_sequences = children.mapped('sequence')
        # no need to resequence if no duplicates.
        if len(children_sequences) == len(set(children_sequences)):
            return

        # find index of duplicates
        duplicate_index = [idx for idx, item in enumerate(children_sequences) if item in children_sequences[:idx]][0]
        start_sequence = children_sequences[duplicate_index] + 1
        # only need to resequence after the duplicate: allow holes in the sequence but limit number of write operations.
        children = children[duplicate_index:]
        for i, child in enumerate(children):
            if i + start_sequence not in write_vals_by_sequence:
                write_vals_by_sequence[i + start_sequence] = child
            else:
                write_vals_by_sequence[i + start_sequence] |= child
