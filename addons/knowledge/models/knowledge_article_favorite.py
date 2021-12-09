# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api, _
from odoo.exceptions import UserError


class ArticleFavorite(models.Model):
    _name = 'knowledge.article.favourite'
    _description = 'Favorite Articles'
    _table = 'knowledge_article_favourite_user_rel'
    _order = 'sequence asc, id DESC'
    _rec_name = 'article_id'

    article_id = fields.Many2one('knowledge.article', 'Article', required=True, ondelete='cascade')
    user_id = fields.Many2one('res.users', 'User', index=True, required=True, ondelete='cascade')
    sequence = fields.Integer(default=0)

    _sql_constraints = [
        ('unique_favourite', 'unique(article_id, user_id)', 'User already has this article in favourites.')
    ]

    @api.model_create_multi
    def create(self, vals_list):
        """ At creation, we need to set the max sequence, if not given, for each favorite to create, in order to keep
        a correct ordering as much as possible. Some sequence could be given in create values, that could lead to
        duplicated sequence per user_id. That is not an issue as they will be resequenced the next time the user reorder
        their favorites. """
        # TODO DBE: Write/change tests to test the create multi with given sequences (that lead to duplicates) + set_sequence that should reorder eveything properly.
        current_user_id = self.env.user.id
        favorite_without_sequences = [vals for vals in vals_list if 'sequence' not in vals]
        user_ids = list(set(vals.get('user_id', current_user_id) for vals in favorite_without_sequences))
        max_sequence_per_user = self._get_users_max_sequence(user_ids)
        for vals in vals_list:
            if 'sequence' not in vals:
                vals['sequence'] = max_sequence_per_user[vals.get('user_id', current_user_id)] + 1
                max_sequence_per_user[vals.get('user_id', current_user_id)] += 1

        return super(ArticleFavorite, self).create(vals_list)

    def set_sequence(self, article_id, sequence=False):
        """ Set user sequence of target favorite article."""
        favorite = self.search([('user_id', '=', self.env.user.id), ('article_id', '=', article_id)])
        if not favorite:
            raise UserError(_("You don't have this article in your favorites."))

        # if no given sequence, place the favourite at the end.
        if sequence is False:
            favorite.sequence = self._get_users_max_sequence([self.env.user.id])[self.env.user.id] + 1
            return True

        # else: set the sequence + reorder all the following articles
        favorite.sequence = sequence
        favorite._resequence_next_favorites()
        return True

    def _resequence_next_favorites(self):
        self.ensure_one()
        start_sequence = self.sequence + 1
        to_update = self.search([
            ('user_id', '=', self.env.user.id),
            ('sequence', '>=', self.sequence),
            ('id', '!=', self.id)])
        for i, favorite in enumerate(to_update):
            favorite.sequence = start_sequence + i

    def _get_users_max_sequence(self, user_ids):
        max_sequence_per_user = dict.fromkeys(user_ids, 0)
        results = self.search_read([('user_id', 'in', user_ids)], fields=['user_id', 'sequence'], order='user_id asc, sequence desc')
        for user_id in user_ids:
            user_max_sequence = next((result['sequence'] for result in results if result['user_id'][0] == user_id), -1)
            max_sequence_per_user[user_id] = user_max_sequence
        return max_sequence_per_user
