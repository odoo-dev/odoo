# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api
from odoo.osv import expression


class Article(models.Model):
    _name = "knowledge.article"
    _description = "Contains the knowledge of a specific subject."
    _inherit = ['mail.thread']
    _order = "favourite_count, last_edition_date desc, level, sequence"
    # _order = "level, sequence"

    name = fields.Char(string="Title", default="New Article")
    body = fields.Html(string="Article Body")
    icon = fields.Char(string='Article Icon', default='fa-file')

    parent_id = fields.Many2one("knowledge.article", string="Parent Article")
    child_ids = fields.One2many("knowledge.article", "parent_id", string="Child Articles")
    # TODO DBE: remove level field as only used for ordering (_order) in views, we use child_ids. ???
    level = fields.Integer(string="Article Level", compute="_compute_level", store=True, readonly=True, recursive=True,
                           help="Level 1 are root articles that has no parent. " +
                                "Level 2 are the children of level 1, etc.")
    sequence = fields.Integer(string="Article Sequence",
                              help="The sequence is computed only among the same level under a single parent.")

    author_ids = fields.Many2many("res.users", string="Authors", default=lambda self: self.env.user)

    # TODO DBE: add authorised_user to allow users to read private article of other users. (+ access_token)
    authorised_user_ids = fields.Many2many("res.users", "knowledge_authorised_user_rel", string="Authorised Users",
                                           help="Authorised users are users that can read the article even if it's private.")

    # Same as write_uid/_date but limited to the body
    last_edition_id = fields.Many2one("res.users", string="Last Edited by")
    last_edition_date = fields.Datetime(string="Last Edited on")

    # Favourite
    is_user_favourite = fields.Boolean(string="Favourite?", compute="_compute_is_user_favourite",
                                       inverse="_inverse_is_user_favourite", search="_search_is_user_favourite")
    favourite_user_ids = fields.Many2many("res.users", "knowledge_favourite_user_rel", "article_id", "user_id",
                                          string="Favourites", copy=False)
    favourite_count = fields.Integer(string="#Is Favourite", copy=False)

    # Published
    website_published = fields.Boolean(string="Website Published")

    # Private ?
    owner_id = fields.Many2one("res.users", string="Current Owner",
                               help="When an article has an owner, it means this article is private for that owner.")
    is_private = fields.Boolean(string="Private", compute="_compute_is_private", inverse="_inverse_is_private")

    @api.depends("parent_id.level")
    def _compute_level(self):
        for article in self:
            if not article.parent_id:
                article.level = 1
            else:
                article.level = article.parent_id.level + 1

    def _compute_is_user_favourite(self):
        for article in self:
            article.is_user_favourite = self.env.user in article.favourite_user_ids

    def _inverse_is_user_favourite(self):
        favorite_articles = not_fav_articles = self.env['knowledge.article']
        for article in self:
            if self.env.user in article.favourite_user_ids:  # unset as favourite
                not_fav_articles |= article
            else:  # set as favourite
                favorite_articles |= article

        favorite_articles.write({'favourite_user_ids': [(4, self.env.uid)]})
        not_fav_articles.write({'favourite_user_ids': [(3, self.env.uid)]})

        for article in not_fav_articles:
            article.favourite_count -= 1
        for article in favorite_articles:
            article.favourite_count += 1

    def _search_is_user_favourite(self, operator, value):
        if operator != "=":
            raise NotImplementedError("Unsupported search operation on favourite articles")

        if value:
            return [('favourite_user_ids', 'in', [self.env.user.id])]
        else:
            return [('favourite_user_ids', 'not in', [self.env.user.id])]

    @api.depends("owner_id")
    def _compute_is_private(self):
        for article in self:
            article.is_private = article.owner_id == self.env.user

    def _inverse_is_private(self):
        private_articles = public_articles = self.env['knowledge.article']
        # changing the privacy of a parent impact all his children.
        for article in self:
            def get_all_children(a):
                if a.child_ids:
                    return a.child_ids | get_all_children(a.child_ids)
                else:
                    return self.env['knowledge.article']
            children = get_all_children(article)

            if self.env.user == article.owner_id:
                public_articles |= article | children
            else:
                private_articles |= article | children

        private_articles.write({'owner_id': self.env.uid})
        public_articles.write({'owner_id': False})

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            vals['last_edition_id'] = self._uid
            vals['last_edition_date'] = fields.Datetime.now()
        return super(Article, self).create(vals_list)

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

    def unlink(self):
        for article in self:
            # Make all the article's children be adopted by the parent's parent.
            # Otherwise, we will have to manage an orphan house.
            parent = article.parent_id
            if parent:
                article.child_ids.write({"parent_id": parent.id})
        return super(Article, self).unlink()

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
        my_articles_domain = expression.AND([[('favourite_user_ids', 'in', [self.env.user.id])], args])
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

    def _get_highest_parent(self):
        self.ensure_one()
        if self.parent_id:
            return self.parent_id._get_highest_parent()
        else:
            return self

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
        if self.filtered(lambda article: article.level == 1):
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
        # only need to resequence after the duplicate
        children = children[duplicate_index:]
        for i, child in enumerate(children):
            if i + start_sequence not in write_vals_by_sequence:
                write_vals_by_sequence[i + start_sequence] = child
            else:
                write_vals_by_sequence[i + start_sequence] |= child

    def show_article(self):
        action = self.env['ir.actions.act_window']._for_xml_id('knowledge.knowledge_article_dashboard_action')
        action['res_id'] = self.env.context.get('res_id', self.search([('parent_id', '=', False), ('owner_id', '=', False)], limit=1, order='sequence').id)
        return action
