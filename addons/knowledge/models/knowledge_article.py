# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import ast

from collections import defaultdict
from werkzeug.urls import url_join

from odoo import fields, models, api, _
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.osv import expression
from odoo.tools import get_lang

from odoo.addons.knowledge.models.tools import ARTICLE_PERMISSION_LEVEL


class Article(models.Model):
    _name = "knowledge.article"
    _description = "Knowledge Articles"
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = "favorite_count, create_date desc, id desc"  # Ordering : Most popular first, then newest articles.

    active = fields.Boolean(default=True)
    name = fields.Char(string="Title", default=lambda self: _('New Article'), required=True)
    body = fields.Html(string="Article Body")
    icon = fields.Char(string='Article Icon')
    cover = fields.Binary(string='Cover Image')
    is_locked = fields.Boolean(
        string='Locked',
        help="When locked, users cannot write on the body or change the title, "
             "even if they have write access on the article.")
    full_width = fields.Boolean(
        string='Full width',
        help="When set, the article body will take the full width available on the article page. "
             "Otherwise, the body will have large horizontal margins.")
    article_url = fields.Char('Article Url', compute='_compute_article_url', readonly=True)
    # Hierarchy and sequence
    parent_id = fields.Many2one("knowledge.article", string="Parent Article")
    child_ids = fields.One2many("knowledge.article", "parent_id", string="Child Articles")
    is_desynchronized = fields.Boolean(
        string="Desyncronized with parents",
        help="If set, this article won't inherit access rules from its parents anymore.")
    sequence = fields.Integer(
        string="Article Sequence",
        default=0,  # Set default=0 to avoid false values and messed up sequence order inside same parent
        help="The sequence is computed only among the articles that have the same parent.")
    root_article_id = fields.Many2one(
        'knowledge.article', string="Subject", recursive=True,
        compute="_compute_root_article_id", store=True, compute_sudo=True,
        help="The subject is the title of the highest parent in the article hierarchy.")
    # Access rules and members + implied category
    internal_permission = fields.Selection(
        [('none', 'No access'), ('read', 'Can read'), ('write', 'Can write')],
        string='Internal Permission', required=False,
        help="Default permission for all internal users. "
             "(External users can still have access to this article if they are added to its members)")
    inherited_permission = fields.Selection(
        [('none', 'No access'), ('read', 'Can read'), ('write', 'Can write')],
        string='Article Inherited Permission',
        compute="_compute_inherited_permission", compute_sudo=True, recursive=True)
    inherited_permission_parent_id = fields.Many2one(
        "knowledge.article", string="Inherited Permission Parent Article",
        compute="_compute_inherited_permission", compute_sudo=True, recursive=True)
    article_member_ids = fields.One2many('knowledge.article.member', 'article_id', string='Members Information', copy=True)
    user_has_access = fields.Boolean(
        string='Has Access',
        compute="_compute_user_has_access", search="_search_user_has_access")
    user_can_write = fields.Boolean(
        string='Can Write',
        compute="_compute_user_can_write", search="_search_user_can_write")
    user_permission = fields.Selection(
        [('none', 'none'), ('read', 'read'), ('write', 'write')],
        string='User permission',
        compute='_compute_user_permission')
    # categories and ownership
    category = fields.Selection(
        [('workspace', 'Workspace'), ('private', 'Private'), ('shared', 'Shared')],
        compute="_compute_category", compute_sudo=True, store=True)
        # Stored to improve performance when loading the article tree. (avoid looping through members if 'workspace')
    # Same as write_uid/_date but limited to the body
    last_edition_uid = fields.Many2one(
        "res.users", string="Last Edited by",
        compute='_compute_last_edition_data', store=True,
        readonly=False, copy=False)
    last_edition_date = fields.Datetime(
        string="Last Edited on",
        compute='_compute_last_edition_data', store=True,
        readonly=False, copy=False)
    # Favorite
    is_user_favorite = fields.Boolean(
        string="Is Favorited?",
        compute="_compute_is_user_favorite", search="_search_is_user_favorite",
        inverse="_inverse_is_user_favorite")
    favorite_ids = fields.One2many(
        'knowledge.article.favorite', 'article_id',
        string='Favorite Articles', copy=False)
    # Set default=0 to avoid false values and messed up order
    favorite_count = fields.Integer(
        string="#Is Favorite",
        compute="_compute_favorite_count", store=True, copy=False, default=0)

    _sql_constraints = [
        ('check_permission_on_root',
         'check(parent_id IS NOT NULL OR internal_permission IS NOT NULL)',
         'Root articles must have internal permission.'
        ),
        ('check_permission_on_desync',
         'check(is_desynchronized IS NOT TRUE OR internal_permission IS NOT NULL)',
         'Desynchronized articles must have internal permission.'
        ),
        ('check_desync_on_root',
         'check(parent_id IS NOT NULL OR is_desynchronized IS NOT TRUE)',
         'Root articles cannot be desynchronized.'
        ),
    ]

    # ------------------------------------------------------------
    # CONSTRAINTS
    # ------------------------------------------------------------

    @api.constrains('internal_permission', 'article_member_ids')
    def _check_has_writer(self):
        """ If article has no member, the internal_permission must be write. as article must have at least one writer.
        If article has member, the validation is done in article.member model as we cannot trigger constraint depending
        on fields from related model. see _check_member from 'knowledge.article.member' model for more details.
        Note : We cannot use the optimised sql request to get the permission and members as values are not yet in DB"""
        for article in self:
            def has_write_member(a, child_members=False):
                if not child_members:
                    child_members = self.env['knowledge.article.member']
                article_members = a.article_member_ids
                if any(m.permission == 'write' and m.partner_id not in child_members.mapped('partner_id')
                       for m in article_members):
                    return True
                elif a.parent_id and not a.is_desynchronized:
                    return has_write_member(a.parent_id, article_members | child_members)
                return False
            if article.inherited_permission != 'write' and not has_write_member(article):
                raise ValidationError(_("The article '%s' needs at least one member with 'Write' access.", article.display_name))

    @api.constrains('parent_id')
    def _check_parent_id(self):
        if not self._check_recursion():
            raise ValidationError(
                _('Articles %s cannot be updated as this would create a recursive hierarchy.',
                  ', '.join(self.mapped('name'))
                 )
            )

    def name_get(self):
        return [(rec.id, "%s %s" % (rec.icon or "📄", rec.name)) for rec in self]

    # ------------------------------------------------------------
    # COMPUTED FIELDS
    # ------------------------------------------------------------

    def _compute_article_url(self):
        for article in self:
            if not article.ids:
                article.article_url = False
            else:
                article.article_url = url_join(article.get_base_url(), 'knowledge/article/%s' % article.id)

    @api.depends('parent_id', 'parent_id.root_article_id')
    def _compute_root_article_id(self):
        wparent = self.filtered('parent_id')
        for article in self - wparent:
            article.root_article_id = article

        if not wparent:
            return
        # group by parents to lessen number of computation
        articles_byparent = defaultdict(lambda: self.env['knowledge.article'])
        for article in wparent:
            articles_byparent[article.parent_id] += article

        for parent, articles in articles_byparent.items():
            ancestors = self.env['knowledge.article']
            while parent:
                if parent in ancestors:
                    raise ValidationError(
                        _('Articles %s cannot be updated as this would create a recursive hierarchy.',
                          ', '.join(articles.mapped('name'))
                         )
                    )
                ancestors += parent
                parent = parent.parent_id
            articles.root_article_id = ancestors[-1:]

    @api.depends('parent_id', 'internal_permission')
    def _compute_inherited_permission(self):
        """ Computed inherited internal permission. We go up ancestors until
        finding an article with an internal permission set, or a root article
        (without parent) or until finding a desynchronized article which
        serves as permission ancestor. Desynchronized articles break the
        permission tree finding. """
        self_inherit = self.filtered(lambda article: article.internal_permission)
        for article in self_inherit:
            article.inherited_permission = article.internal_permission
            article.inherited_permission_parent_id = False

        remaining = self - self_inherit
        if not remaining:
            return
        # group by parents to lessen number of computation
        articles_byparent = defaultdict(lambda: self.env['knowledge.article'])
        for article in remaining:
            articles_byparent[article.parent_id] += article

        for parent, articles in articles_byparent.items():
            ancestors = self.env['knowledge.article']
            while parent:
                if parent in ancestors:
                    raise ValidationError(
                        _('Articles %s cannot be updated as this would create a recursive hierarchy.',
                          ', '.join(articles.mapped('name'))
                         )
                    )
                ancestors += parent
                if parent.internal_permission or parent.is_desynchronized:
                    break
                parent = parent.parent_id
            articles.inherited_permission = ancestors[-1:].internal_permission
            articles.inherited_permission_parent_id = ancestors[-1:]

    @api.depends_context('uid')
    @api.depends('internal_permission', 'article_member_ids.partner_id', 'article_member_ids.permission')
    def _compute_user_permission(self):
        """ Returns the explicit permission of the user. If the user has no specific permission
        (via the members or the internal permission), user_permission will be False
        (E.g.: Public users has no specific permission at all).
        Share users only depends on the members as internal permission does not apply to them."""
        if self.env.user._is_public():
            self.user_permission = False
            return
        articles_permissions = {}
        if not self.env.user.share:
            articles_permissions = self._get_internal_permission()
        member_permissions = self._get_partner_member_permissions(self.env.user.partner_id.id)
        for article in self:
            if not article.ids:  # If article not created yet, set default permission value.
                article.user_permission = 'write'
                continue
            article_id = article.ids[0]
            if self.env.user.share:
                article.user_permission = member_permissions.get(article_id, False)
            else:
                article.user_permission = member_permissions.get(article_id, False) \
                                          or articles_permissions[article_id]

    @api.depends_context('uid')
    @api.depends('user_permission')
    def _compute_user_has_access(self):
        """ Compute if the current user has access to the article.
        This is done by checking if the user is admin, or checking the internal permission of the article
        and wether the user is member of the article. `.ids[0]` is used to avoid issues with <newId> records
        """
        if self.env.user.has_group('base.group_system'):
            self.user_has_access = True
            return
        if self.env.user._is_public():
            self.user_has_access = False
            return
        for article in self:
            article.user_has_access = article.user_permission and article.user_permission != 'none'

    def _search_user_has_access(self, operator, value):
        """ This search method will look at article permission and member permission
        to return all the article the current user has access to.
            - The admin (group_system) always has access to everything
            - External users only have access to an article if they are r/w member on that article
            - Internal users have access if:
                - they are read or write member on the article
                OR
                - The article allow read or write access to all internal users AND the user
                is not member with 'none' access
            """
        if operator not in ('=', '!=') or not isinstance(value, bool):
            raise ValueError("unsupported search operator")

        articles_with_access = self._get_internal_permission(check_access=True)

        member_permissions = self._get_partner_member_permissions(self.env.user.partner_id.id)
        articles_with_no_member_access = [id for id, permission in member_permissions.items() if permission == 'none']
        articles_with_member_access = list(set(member_permissions.keys() - set(articles_with_no_member_access)))

        # If searching articles for which user has access.
        domain = self._get_additional_access_domain()
        if (value and operator == '=') or (not value and operator == '!='):
            if self.env.user.has_group('base.group_system'):
                return expression.TRUE_DOMAIN
            elif self.env.user.share:
                return expression.OR([domain, [('id', 'in', articles_with_member_access)]])
            return expression.OR([domain, [
                '|',
                    '&',
                        ('id', 'in', list(articles_with_access.keys())),
                        ('id', 'not in', articles_with_no_member_access),
                    ('id', 'in', articles_with_member_access)]])
        # If searching articles for which user has NO access.
        domain = [expression.NOT_OPERATOR, expression.normalize_domain(domain)]
        if self.env.user.has_group('base.group_system'):
            return expression.FALSE_DOMAIN
        elif self.env.user.share:
            return expression.AND([domain, [('id', 'not in', articles_with_member_access)]])
        return expression.AND([domain, [
            '|',
                '&',
                    ('id', 'not in', list(articles_with_access.keys())),
                    ('id', 'not in', articles_with_member_access),
                ('id', 'in', articles_with_no_member_access)]])

    @api.depends_context('uid')
    @api.depends('user_permission')
    def _compute_user_can_write(self):
        if self.env.user.has_group('base.group_system'):
            self.user_can_write = True
            return
        if self.env.user.share:
            self.user_can_write = False
            return
        for article in self:
            article.user_can_write = article.user_permission == 'write'

    def _search_user_can_write(self, operator, value):
        if operator not in ('=', '!=') or not isinstance(value, bool):
            raise NotImplementedError("unsupported search operator")

        articles_with_access = self._get_internal_permission(check_write=True)

        member_permissions = self._get_partner_member_permissions(self.env.user.partner_id.id)
        articles_with_member_access = [id for id, permission in member_permissions.items() if permission == 'write']
        articles_with_no_member_access = list(set(member_permissions.keys() - set(articles_with_member_access)))

        # If searching articles for which user has write access.
        if self.env.user.has_group('base.group_system'):
            return expression.TRUE_DOMAIN
        elif self.env.user.share:
            return [('id', 'in', articles_with_member_access)]
        if (value and operator == '=') or (not value and operator == '!='):
            return [
                '|',
                    '&',
                        ('id', 'in', list(articles_with_access.keys())),
                        ('id', 'not in', articles_with_no_member_access),
                    ('id', 'in', articles_with_member_access)
            ]
        # If searching articles for which user has NO write access.
        if self.env.user.has_group('base.group_system'):
            return expression.FALSE_DOMAIN
        elif self.env.user.share:
            return [('id', 'not in', articles_with_member_access)]
        return [
            '|',
                '&',
                    ('id', 'not in', list(articles_with_access.keys())),
                    ('id', 'not in', articles_with_member_access),
                ('id', 'in', articles_with_no_member_access)
        ]

    @api.depends('root_article_id.internal_permission', 'root_article_id.article_member_ids.permission')
    def _compute_category(self):
        # compute workspace articles
        workspace_articles = self.filtered(lambda a: a.root_article_id.internal_permission != 'none')
        workspace_articles.category = 'workspace'

        remaining_articles = self - workspace_articles
        if not remaining_articles:
            return

        results = self.env['knowledge.article.member'].read_group([
            ('article_id', 'in', remaining_articles.root_article_id.ids), ('permission', '!=', 'none')
        ], ['article_id'], ['article_id'])  # each returned member is read on write.
        access_member_per_root_article = dict.fromkeys(remaining_articles.root_article_id.ids, 0)
        for result in results:
            access_member_per_root_article[result['article_id'][0]] += result["article_id_count"]

        for article in remaining_articles:
            # should never crash as non workspace articles always have at least one member with access.
            if access_member_per_root_article[article.root_article_id.id] > 1:
                article.category = 'shared'
            else:
                article.category = 'private'

    @api.depends('favorite_ids')
    def _compute_favorite_count(self):
        favorites = self.env['knowledge.article.favorite'].read_group(
            [('article_id', 'in', self.ids)], ['article_id'], ['article_id']
        )
        favorites_count_by_article = {
            favorite['article_id'][0]: favorite['article_id_count'] for favorite in favorites}
        for article in self:
            article.favorite_count = favorites_count_by_article.get(article.id, 0)

    @api.depends('body')
    def _compute_last_edition_data(self):
        """ Each change of body is considered as a content edition update. """
        self.last_edition_uid = self.env.uid
        self.last_edition_date = self.env.cr.now()

    @api.depends_context('uid')
    @api.depends('favorite_ids.user_id')
    def _compute_is_user_favorite(self):
        for article in self:
            article.is_user_favorite = self.env.user in article.favorite_ids.user_id

    def _inverse_is_user_favorite(self):
        to_fav = self.filtered(lambda article: self.env.user not in article.favorite_ids.user_id)
        to_unfav = self - to_fav

        if to_fav:
            to_fav.favorite_ids = [(0, 0, {'user_id': self.env.uid})]
        if to_unfav:
            to_unfav.favorite_ids.filtered(lambda u: u.user_id == self.env.user).unlink()

    def _search_is_user_favorite(self, operator, value):
        if operator != "=":
            raise NotImplementedError("Unsupported search operation on favorite articles")

        if value:
            return [('favorite_ids.user_id', 'in', [self.env.uid])]
        return [('favorite_ids.user_id', 'not in', [self.env.uid])]

    def _get_additional_access_domain(self):
        """ This method is meant to be overridden when website is installed (to add website_published)
        Basically, this method is used to add additional domain part to the search domain on user_has_access field."""
        return []

    # ------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------

    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        """ Override to support ordering on is_user_favorite.

        Ordering through web client calls search_read with an order parameter set.
        Search_read then calls search. In this override we therefore override search
        to intercept a search without count with an order on is_user_favorite.
        In that case we do the search in two steps.

        First step: fill with current user's favorite results

          * Search articles that are favorite of the current user.
          * Results of that search will be at the top of returned results. Use limit
            None because we have to search all favorite articles.
          * Finally take only a subset of those articles to fill with
            results matching asked offset / limit.

        Second step: fill with other results. If first step does not gives results
        enough to match offset and limit parameters we fill with a search on other
        articles. We keep the asked domain and ordering while filtering out already
        scanned articles to keep a coherent results.

        All other search and search_read are left untouched by this override to avoid
        side effects. Search_count is not affected by this override.
        """
        if count or not order or 'is_user_favorite' not in order:
            return super(Article, self).search(args, offset=offset, limit=limit, order=order, count=count)
        order_items = [order_item.strip().lower() for order_item in (order or self._order).split(',')]
        favorite_asc = any('is_user_favorite asc' in item for item in order_items)

        # Search articles that are favorite of the current user.
        my_articles_domain = expression.AND([[('favorite_ids.user_id', 'in', [self.env.uid])], args])
        my_articles_order = ', '.join(item for item in order_items if 'is_user_favorite' not in item)
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
        # is_user_favorite when calling super() .
        article_limit = (limit - len(my_articles_ids_keep)) if limit else None
        if offset:
            article_offset = max((offset - len(articles_ids), 0))
        else:
            article_offset = 0
        article_order = ', '.join(item for item in order_items if 'is_user_favorite' not in item)

        other_article_res = super(Article, self).search(
            expression.AND([[('id', 'not in', my_articles_ids_skip)], args]),
            offset=article_offset, limit=article_limit, order=article_order, count=count
        )
        if favorite_asc in order_items:
            return other_article_res + self.browse(my_articles_ids_keep)
        else:
            return self.browse(my_articles_ids_keep) + other_article_res

    @api.model_create_multi
    def create(self, vals_list):
        """ While creating records, automatically organize articles to be the
        last of their parent children, unless a sequence is given.
        Also, set internal_permission 'default' value (write) if we create a root article,
        and set the log_access custom fields."""
        vals_by_parent_id = {}
        default_parent_id = self.default_get(['parent_id']).get('parent_id')
        for vals in vals_list:
            parent_id = vals.get('parent_id') or default_parent_id or False
            vals_by_parent_id.setdefault(parent_id, []).append(vals)

            if not vals.get('parent_id') and not vals.get('internal_permission'):
                vals['internal_permission'] = 'write'

        max_sequence_by_parent = {}
        if vals_by_parent_id:
            read_group_results = self.env['knowledge.article'].sudo().read_group(
                [('parent_id', 'in', list(vals_by_parent_id.keys()))],
                ['sequence:max'],
                ['parent_id']
            )
            for read_group_result in read_group_results:
                if not read_group_result['parent_id']:
                    index = False
                else:
                    index = read_group_result['parent_id'][0]
                max_sequence_by_parent[index] = read_group_result['sequence']

        for parent_id, article_vals in vals_by_parent_id.items():
            current_sequence = 0
            if parent_id in max_sequence_by_parent:
                current_sequence = max_sequence_by_parent[parent_id] + 1

            for vals in article_vals:
                if 'sequence' in vals:
                    current_sequence = vals.get('sequence')
                else:
                    vals['sequence'] = current_sequence
                    current_sequence += 1

        return super(Article, self).create(vals_list)

    def write(self, vals):
        # Move under a parent is considered as a write on it (permissions, ...)
        if vals.get('parent_id'):
            parent = self.browse(vals['parent_id'])
            parent.check_access_rights('write')
            parent.check_access_rule('write')

        result = super(Article, self).write(vals)

        if any(field in ['parent_id', 'sequence'] for field in vals):
            self._resequence()

        return result

    @api.returns('self', lambda value: value.id)
    def copy(self, default=None):
        self.ensure_one()
        self = self.sudo()
        default = dict(default or {},
                       name=_("%s (copy)", self.name),
                       sequence=self.sequence+1)
        if self.user_has_access:
            if not self.user_can_write:
                default.update({
                    "article_member_ids": [(0, 0, {
                        'partner_id': self.env.user.partner_id.id,
                        'permission': 'write'
                    })]})
            elif 'article_member_ids' in default:
                del default['article_member_ids']
        return super().copy(default=default)

    def unlink(self):
        for article in self:
            # Make all the article's children be adopted by the parent's parent.
            # Otherwise, we will have to manage an orphan house.
            parent = article.parent_id
            if parent:
                article.child_ids.write({"parent_id": parent.id})
        return super(Article, self).unlink()

    # ------------------------------------------------------------
    # ACTIONS
    # ------------------------------------------------------------

    def action_home_page(self):
        res_id = self.env.context.get('res_id', False)
        if not res_id:
            article = self.env['knowledge.article.favorite'].search([
                ('user_id', '=', self.env.uid), ('article_id.active', '=', True)
            ], limit=1).article_id
            if not article:
                # retrieve workspace articles first, then private/shared ones.
                article = self.search([
                    ('parent_id', '=', False)
                ], limit=1, order='sequence, internal_permission desc')
        else:
            article = self.browse(res_id)
        mode = 'edit' if article.user_can_write else 'readonly'
        action = self.env['ir.actions.act_window']._for_xml_id('knowledge.knowledge_article_dashboard_action')
        action['res_id'] = article.id
        action['context'] = dict(ast.literal_eval(action.get('context')), form_view_initial_mode=mode)
        return action

    def action_set_lock(self):
        self.is_locked = True

    def action_set_unlock(self):
        self.is_locked = False

    def action_toggle_favorite(self):
        """ Read access is sufficient for toggling its own favorite status. """
        article = self.sudo()
        if not article.user_has_access:
            raise AccessError(_("You cannot add/remove the article '%s' to/from your favorites", article.display_name))
        article.is_user_favorite = not article.is_user_favorite
        return self[0].is_user_favorite if self else False

    def action_set_favorite_sequence(self, sequence):
        self.ensure_one()
        favorite = self.env["knowledge.article.favorite"].search([
            ('user_id', '=', self.env.uid), ('article_id', '=', self.id)
        ])
        if not favorite:
            raise UserError(_("You don't have the article '%s' in your favorites.", self.display_name))
        return favorite._set_sequence(sequence)

    def action_archive(self):
        super(Article, self | self._get_descendants()).action_archive()
        return self.with_context(res_id=False).action_home_page()

    # ------------------------------------------------------------
    # SEQUENCE / ORDERING
    # ------------------------------------------------------------

    def move_to(self, parent_id=False, before_article_id=False, private=False):
        self.ensure_one()
        if not self.user_can_write:
            raise AccessError(_("You are not allowed to move the article '%s'.", self.display_name))
        parent = self.browse(parent_id) if parent_id else False
        if parent and not parent.user_can_write:
            raise AccessError(_("You are not allowed to move this article under the article '%s'.", parent.display_name))
        before_article = self.browse(before_article_id) if before_article_id else False

        if before_article:
            sequence = before_article.sequence
        else:
            # get max sequence among articles with the same parent
            sequence = self._get_max_sequence_inside_parent(parent_id)

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
            self_member = self.article_member_ids.filtered(lambda m: m.partner_id == self.env.user.partner_id)
            if self_member:
                members_to_remove = self.article_member_ids - self_member
                values['article_member_ids'] = [(1, self_member.id, {'permission': 'write'})]
            else:
                members_to_remove = self.article_member_ids
                values['article_member_ids'] = [(0, 0, {
                    'partner_id': self.env.user.partner_id.id,
                    'permission': 'write'
                })]

        # sudo to write on members
        self.sudo().write(values)
        members_to_remove.unlink()

        return True

    def _resequence(self):
        """ This method re-order the children of the same parent (brotherhood) if needed.
         If an article have been moved from one parent to another, we don't need to resequence the children of the
         old parent as the order remains unchanged. We only need to resequence the children of the new parent only if
         the sequences of the children contains duplicates. When reordering an article, we assume that we always set
         the sequence equals to the position we want it to be, and we use the write_date to differentiate the new order
         between duplicates in sequence.
         So if we want article D to be placed at 3rd position between A B et C: set D.sequence = 2, but C was already 2.
         To know which one is the real 3rd in position, we use the write_date. The last modified is the real 3rd. """
        parent_ids = self.mapped("parent_id").ids
        if any(not article.parent_id for article in self):
            parent_ids.append(False)
        all_children = self.search(
            [("parent_id", 'in', parent_ids)],
            order="sequence ASC, write_date DESC"
        )
        # sort all_chidren: sequence ASC, then modified, then write date DESC
        all_children = all_children.sorted(
            lambda article: (-1 * article.sequence,
                             article in self,
                             article.write_date
                             ),
            reverse=True  # due to date
        )

        article_to_update_by_sequence = defaultdict(self.env['knowledge.article'].browse)
        for parent_id in parent_ids:
            children = all_children.filtered(lambda a: a.parent_id.id == parent_id)
            sequences = children.mapped('sequence')
            # no need to resequence if no duplicates.
            if len(sequences) == len(set(sequences)):
                return

            # only need to resequence after duplicate: allow holes in the sequence but limit number of write operations.
            duplicate_index = [idx for idx, item in enumerate(sequences) if item in sequences[:idx]][0]
            start_sequence = sequences[duplicate_index] + 1
            for i, child in enumerate(children[duplicate_index:]):
                article_to_update_by_sequence[i + start_sequence] |= child

        for sequence in article_to_update_by_sequence:  # Call super to avoid loop in write
            super(Article, article_to_update_by_sequence[sequence]).write({'sequence': sequence})

    def _get_max_sequence_inside_parent(self, parent_id):
        max_sequence_article = self.env['knowledge.article'].search(
            [('parent_id', '=', parent_id)],
            order="sequence desc",
            limit=1
        )
        return max_sequence_article.sequence + 1 if max_sequence_article else 0

    # ------------------------------------------------------------
    # HELPERS
    # ------------------------------------------------------------

    def article_create(self, title=False, parent_id=False, private=False):
        parent = self.browse(parent_id) if parent_id else False

        if parent:
            if not parent.user_can_write:
                raise AccessError(_("You can't create an article under article '%s' as you can't write on it", parent.display_name))
            if private:
                if parent.category != "private":
                    raise ValidationError(_("Cannot create an article under article '%s', which is a non-private parent", parent.display_name))
                elif not parent.user_can_write:
                    raise AccessError(_("You cannot create an article under article '%s' as you don't own it", parent.display_name))
            private = parent.category == "private"

        values = {
            'parent_id': parent_id,
            'sequence': self._get_max_sequence_inside_parent(parent_id)
        }
        if not parent:
            # you cannot create an article without parent in shared directly.
            values['internal_permission'] = 'none' if private else 'write'
        # User cannot write on members, sudo is needed to allow to create a private article or create under a parent user can write on.
        # for article without parent or not in private, access to members is not required to create an article
        if (private or parent) and self.env.user.has_group('base.group_user'):
            self = self.sudo()
        if not parent and private:
            # To be private, the article hierarchy need at least one member with write access.
            values['article_member_ids'] = [(0, 0, {
                'partner_id': self.env.user.partner_id.id,
                'permission': 'write'
            })]

        if title:
            values.update({
                'name': title,
                'body': "<h1>" + title + "</h1>",
            })

        return self.create(values).id

    def get_user_sorted_articles(self, search_query, fields, order_by, limit):
        """ Called when using the Command palette to search for articles matching the search_query.
        As the article should be sorted also in function of the current user's favorite sequence, a search_read rpc
        won't be enough to returns the articles in the correct order.
        This method returns a list of article proposal matching the search_query sorted by:
            - is_user_favorite
            - Favorite sequence
            - Favorite count
        and returned result mimic a search_read result structure.
        """
        search_domain = ["|", ("name", "ilike", search_query), ("root_article_id.name", "ilike", search_query)]
        articles = self.search(search_domain, order=order_by, limit=limit)

        favorite_articles = articles.filtered(
            lambda a: a.is_user_favorite).sorted(
                key=lambda a: a.favorite_ids.filtered(
                    lambda f: f.user_id == self.env.user
                ).sequence)
        sorted_articles = favorite_articles | (articles - favorite_articles)

        # TODO DBE: don't we have something that does that already ?
        def get_field_info(article, field_name):
            field = article._fields[field_name]
            if field.type in ('many2one', 'one2many', 'many2many'):
                rec = article[field_name]
                return [rec.id, rec.sudo().display_name] if rec else False
            else:
                return article[field_name]

        return [
            {field: get_field_info(article, field) for field in fields}
            for article in sorted_articles
        ]

    # ------------------------------------------------------------
    # PERMISSIONS / MEMBERS
    # ------------------------------------------------------------

    def restore_article_access(self):
        """ This method will reset the permissions based on parent articles.
        It will remove all the members except the members on the articles that are not on any parent
        or that have higher permission than from parents."""
        self.ensure_one()
        if not self.parent_id:
            return False
        member_permission = (self | self.parent_id)._get_article_member_permissions()
        article_members_permission = member_permission[self.id]
        parents_members_permission = member_permission[self.parent_id.id]

        members_values = []
        for partner, values in article_members_permission.items():
            permission = values['permission']
            if values["based_on"] or partner not in parents_members_permission \
                or ARTICLE_PERMISSION_LEVEL[permission] > ARTICLE_PERMISSION_LEVEL[parents_members_permission[partner]['permission']]:
                continue
            members_values.append((3, values['member_id']))

        return self.write({
            'internal_permission': False,
            'article_member_ids': members_values,
            'is_desynchronized': False
        })

    def _desync_access_from_parents(self, partner_ids=False, member_permission=False, internal_permission=False):
        """ This method will copy all the inherited access from parents on the article, except for the given partner_ids,
        if any, in order to de-synchronize the article from its parents in terms of access.
        If member_permission is given, the method will then create a new member for the given partner_id with the given
        permission. """
        self.ensure_one()
        members_permission = self._get_article_member_permissions()[self.id]
        internal_permission = internal_permission or self.inherited_permission

        members_values = []
        for partner_id, values in members_permission.items():
            # if member already on self, do not add it.
            if not values['based_on'] or values['based_on'] == self.id:
                continue
            new_member_permission = values['permission']

            if partner_ids and partner_id in partner_ids.ids and member_permission:
                new_member_permission = member_permission

            members_values.append((0, 0, {
                'partner_id': partner_id,
                'permission': new_member_permission
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
        values = {'internal_permission': permission}
        # always add current user as writer if user sets permission != write
        should_invite_self = False
        if self.user_can_write and permission != "write":
            should_invite_self = True
        # when downgrading internal permission on a child article, desync it from parent
        if not self.is_desynchronized and self.parent_id \
                and ARTICLE_PERMISSION_LEVEL[self.parent_id.inherited_permission] > ARTICLE_PERMISSION_LEVEL[permission]:
            if should_invite_self:
                self._add_members(self.env.user.partner_id, 'write')
            return self._desync_access_from_parents(internal_permission=permission)
        # Resyncro Internal permission if we set same permission as parent.
        if permission == self.parent_id.inherited_permission and not self.article_member_ids:
            values.update({
                'internal_permission': False,
                'is_desynchronized': False
            })
        if should_invite_self:
            self._add_members(self.env.user.partner_id, 'write')
        return self.write(values)

    def _set_member_permission(self, member, permission, is_based_on=False):
        """ Set the given permission to the given member.
        If the member was based on a parent article:
            If the new permission is downgrading the member's access:
                the current article will be desynchronized form its parent.
            Else:
                We add a new member with the given permission on the target article. """
        self.ensure_one()
        if is_based_on:
            downgrade = ARTICLE_PERMISSION_LEVEL[member.permission] > ARTICLE_PERMISSION_LEVEL[permission]
            if downgrade:
                self._desync_access_from_parents(member.partner_id, permission)
            else:
                self._add_members(member.partner_id, permission)
        else:
            member.write({'permission': permission})

    def _remove_member(self, member, is_based_on=False):
        """ Remove a member from the article.
        If the member was based on a parent article, the current article will be desynchronized form its parent.
        We also ensure the partner to removed is removed after the desynchronization (if was copied from parent). """
        self.ensure_one()
        if is_based_on:
            self._desync_access_from_parents(self.article_member_ids.partner_id)
            self.article_member_ids.filtered(lambda m: m.partner_id == member.partner_id).sudo().unlink()
        else:
            member = self.article_member_ids.filtered(lambda m: m.id == member.id)
            remove_self, upgrade_self = self.env.user.partner_id == member.partner_id, False
            if remove_self:
                upgrade_self = not member.has_higher_permission
            if not self.user_can_write and upgrade_self:
                raise AccessError(_("You cannot remove the member '%s' from article '%s'.", member.display_name, self.display_name))
            member.sudo().unlink()

    def invite_members(self, partners, permission):
        """
        Invite the given partners to the current article.
        :param partner_ids (Model<res.partner>): Recordset of res.partner
        :param permission (string): permission ('none', 'read' or 'write')
        """
        self.ensure_one()
        share_partner_ids = partners.filtered(lambda partner: partner.partner_share)
        if permission != 'none':
            self._add_members(share_partner_ids, 'read')
            self._add_members(partners - share_partner_ids, permission)
            # prevent the invited user to get access to children articles the current user has no access to
            descendants = self._get_descendants().filtered(lambda c: not c.user_can_write)
            if descendants:
                descendants._add_members(partners, 'none')
        else:
            self._add_members(partners, permission)

        if permission != 'none':
            for partner in partners:
                self._send_invite_mail(partner)

        return True

    def _add_members(self, partners, permission):
        """ This method will add a new member to the current article with the given permission.
        If the given partner was already member on the current article, the permission is updated instead.
        :param partners (Model<res.partner>): Recordset of res.partner
        :param permission (string): permission ('none', 'read' or 'write')
        """
        self.ensure_one()
        if not self.user_can_write:
            raise AccessError(
                _("You cannot give access to the article '%s' as you are not editor.", self.name))

        members_to_update = self.article_member_ids.filtered_domain([('partner_id', 'in', partners.ids)])
        members_to_create = partners - members_to_update.mapped('partner_id')

        members_to_write = [(0, 0, {
            'partner_id': partner.id,
            'permission': permission
        }) for partner in members_to_create]
        for member in members_to_update:
            members_to_write.append((1, member.id, {'permission': permission}))

        self.sudo().write({
            'article_member_ids': members_to_write
        })

    @api.model
    def _get_internal_permission(self, check_access=False, check_write=False):
        """ We don't use domain because we cannot include properly the where clause in the custom sql query.
        The query's output table and fields names does not match the model we are working on"""
        domain = []
        args = []
        if self.ids:
            args = [tuple(self.ids)]
            domain.append("article_id in %s")
        if check_access:
            domain.append("internal_permission != 'none'")
        elif check_write:
            domain.append("internal_permission = 'write'")
        domain = ("WHERE " + " AND ".join(domain)) if domain else ''

        sql = '''
    WITH RECURSIVE article_perms as (
        SELECT id, id as article_id, parent_id, internal_permission
          FROM knowledge_article
         UNION
        SELECT parents.id, perms.article_id, parents.parent_id,
               COALESCE(perms.internal_permission, parents.internal_permission)
          FROM knowledge_article parents
    INNER JOIN article_perms perms
            ON perms.parent_id=parents.id
               AND perms.internal_permission IS NULL
    )
    SELECT article_id, max(internal_permission)
      FROM article_perms
           %s
  GROUP BY article_id''' % (domain)
        self._cr.execute(sql, args)
        return dict(self._cr.fetchall())

    @api.model
    def _get_partner_member_permissions(self, partner_id):
        """ Retrieve the permission for the given partner for all articles.
        The articles can be filtered using the article_ids param.

        The member model is fully flushed before running the request. """

        self.env['knowledge.article.member'].flush()

        domain = "WHERE permission is not null"
        args = []
        if self.ids:
            args = [tuple(self.ids)]
            domain += " AND article_id in %s"

        sql = '''
    WITH RECURSIVE article_perms as (
        SELECT a.id, a.parent_id, m.permission
          FROM knowledge_article a
     LEFT JOIN knowledge_article_member m
            ON a.id=m.article_id and partner_id = %s
    ), article_rec as (
        SELECT perms1.id, perms1.id as article_id, perms1.parent_id, perms1.permission
          FROM article_perms as perms1
         UNION
        SELECT perms2.id, perms_rec.article_id, perms2.parent_id, COALESCE(perms_rec.permission, perms2.permission)
          FROM article_perms as perms2
    INNER JOIN article_rec perms_rec
            ON perms_rec.parent_id=perms2.id
               AND perms_rec.permission IS NULL
    )
    SELECT article_id, max(permission)
      FROM article_rec
           %s
  GROUP BY article_id''' % (partner_id, domain)

        self._cr.execute(sql, args)
        return dict(self._cr.fetchall())

    def _get_article_member_permissions(self, additional_fields=False):
        """ Retrieve the permission for all the members that apply to the target article.
        Members that apply are not only the ones on the article but can also come from parent articles.

        The caller can pass additional fields to retrieve from the following models:
        - res.partner, joined on the partner_id of the membership
        - knowledge.article, joined on the 'origin' of the membership
          (when the membership is based on one of its parent article)
          to retrieve more fields on the origin of the membership
        - knowledge.article.member to retrieve more fields on the membership

        The expected format is:
        {'model': [('field', 'field_alias')]}

        e.g: {
            'res.partner': [
                ('name', 'partner_name'),
                ('email', 'partner_email'),
            ]
        }

        Please note that these additional fields are not sanitized, the caller has the
        responsability to check that user can access those fields and that no injection is possible. """
        domain = "WHERE partner_id is not null"
        args = []
        if self.ids:
            args = [tuple(self.ids)]
            domain += " AND article_id in %s"

        additional_select_fields = ''
        join_clause = ''
        if additional_fields:
            supported_additional_models = [
                'res.partner',
                'knowledge.article',
                'knowledge.article.member',
            ]

            # 1. build the join clause based on the given models (additional_fields keys)
            join_clauses = []
            for model in additional_fields.keys():
                if model not in supported_additional_models:
                    continue

                table_name = self.env[model]._table
                join_condition = ''
                if model == 'res.partner':
                    join_condition = f'{table_name}.id = partner_id'
                elif model == 'knowledge.article':
                    join_condition = f'{table_name}.id = origin_id'
                elif model == 'knowledge.article.member':
                    join_condition = f'{table_name}.id = member_id'

                join_clauses.append(f'LEFT OUTER JOIN {table_name} ON {join_condition}')

            join_clause = ' '.join(join_clauses)

            # 2. build the select clause based on the given fields/aliases pairs
            # (additional_fields values)
            select_fields = []
            for model, fields_list in additional_fields.items():
                if model not in supported_additional_models:
                    continue

                table_name = self.env[model]._table
                for (field, field_alias) in fields_list:
                    select_fields.append(f'{table_name}.{field} as {field_alias}')

            additional_select_fields = ', %s' % ', '.join(select_fields)

        sql = '''
    WITH article_permission as (
        WITH RECURSIVE article_perms as (
            SELECT a.id, a.parent_id, m.id as member_id, m.partner_id, m.permission
            FROM knowledge_article a
        LEFT JOIN knowledge_article_member m
                ON a.id = m.article_id
        ), article_rec as (
            SELECT perms1.id, perms1.id as article_id, perms1.parent_id, perms1.member_id,
                perms1.partner_id, perms1.permission, perms1.id as origin_id, 0 as level
            FROM article_perms as perms1
            UNION
            SELECT perms2.id, perms_rec.article_id, perms2.parent_id, perms2.member_id,
                perms2.partner_id, perms2.permission, perms2.id as origin_id, perms_rec.level + 1
            FROM article_perms as perms2
        INNER JOIN article_rec perms_rec
                ON perms_rec.parent_id=perms2.id
        )
        SELECT article_id, origin_id, member_id, partner_id, permission, min(level) as min_level
        FROM article_rec
            %(where_clause)s
        GROUP BY article_id, origin_id, member_id, partner_id, permission
    )
    SELECT article_id, origin_id, member_id, partner_id, permission, min_level
           %(additional_select_fields)s
    FROM article_permission
    %(join_clause)s
        ''' % {
            'additional_select_fields': additional_select_fields,
            'where_clause': domain,
            'join_clause': join_clause,
        }

        self._cr.execute(sql, args)
        results = self._cr.dictfetchall()

        # Now that we have, for each article, all the members found on themselves and their parents.
        # We need to keep only the first partners found (lowest level) for each article
        article_members = defaultdict(dict)
        min_level_dict = defaultdict(dict)

        _nolevel = -1
        for result in results:
            article_id = result['article_id']
            origin_id = result['origin_id']
            partner_id = result['partner_id']
            level = result['min_level']
            min_level = min_level_dict[article_id].get(partner_id, _nolevel)
            if min_level == _nolevel or level < min_level:
                article_members[article_id][partner_id] = {
                    'member_id': result['member_id'],
                    'based_on': origin_id if origin_id != article_id else False,
                    'permission': result['permission']
                }
                min_level_dict[article_id][partner_id] = level

                if additional_fields:
                    # update our resulting dict based on additional fields
                    article_members[article_id][partner_id].update({
                        field_alias: result[field_alias] if model != 'knowledge.article' or origin_id != article_id else False
                        for model, fields_list in additional_fields.items()
                        for (field, field_alias) in fields_list
                    })
        # add empty member for each article that doesn't have any.
        for article in self:
            if article.id not in article_members:
                article_members[article.id][None] = {'based_on': False, 'member_id': False, 'permission': None}

                if additional_fields:
                    # update our resulting dict based on additional fields
                    article_members[article.id][None].update({
                        field_alias: False
                        for model, fields_list in additional_fields.items()
                        for (field, field_alias) in fields_list
                    })

        return article_members

    # ------------------------------------------------------------
    # MAILING
    # ------------------------------------------------------------

    def _send_invite_mail(self, partner):
        # TODO: only send one email if user is invited to multiple articles?
        for article in self:
            subject = _("Invitation to access %s", article.name)
            partner_lang = get_lang(self.env, lang_code=partner.lang).code
            body = self.env['ir.qweb'].with_context(lang=partner_lang)._render(
                'knowledge.knowledge_article_mail_invite', {
                    'record': article,
                    'user': self.env.user,
                    'recipient': partner,
                    'link': article._get_invite_url(partner),
            })

            article.with_context(lang=partner_lang).message_notify(
                partner_ids=partner.ids, body=body, subject=subject,
                email_layout_xmlid='mail.mail_notification_light'
            )

    # ------------------------------------------------------------
    # TOOLS
    # ------------------------------------------------------------

    def _get_invite_url(self, partner):
        self.ensure_one()
        member = self.env['knowledge.article.member'].search([('article_id', '=', self.id), ('partner_id', '=', partner.id)])
        return url_join(self.get_base_url(), "/knowledge/article/invite/%s/%s" % (member.id, member._get_invitation_hash()))

    def get_valid_parent_options(self, term=""):
        """ Returns the list of articles that can be set as parent for the
        current article (to avoid recursions) """
        return self.search_read(
            domain=['&',
                    ['name', '=ilike', '%%%s%%' % term],
                    ['id', 'not in', (self._get_descendants() + self).ids]
                   ],
            fields=['id', 'icon', 'name'],
        )

    def _get_descendants(self):
        """ Returns the descendants recordset of the current article. """
        return self.env['knowledge.article'].search([('id', 'not in', self.ids), ('parent_id', 'child_of', self.ids)])

    def _get_parents(self):
        """ Returns the parents recordset of the current article. """
        parents = self.env['knowledge.article']
        if self.parent_id.user_has_access:
            parents |= self.parent_id
            parents |= self.parent_id._get_parents()
        return parents
