# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, tools, _
from odoo.exceptions import ValidationError

from odoo.addons.knowledge.models.tools import ARTICLE_PERMISSION_LEVEL


class ArticleMember(models.Model):
    _name = 'knowledge.article.member'
    _description = 'Article Members'
    _rec_name = 'partner_id'

    article_id = fields.Many2one(
        'knowledge.article', 'Article',
        ondelete='cascade', required=True)
    partner_id = fields.Many2one(
        'res.partner', 'Partner',
        index=True, ondelete='cascade', required=True)
    permission = fields.Selection(
        [('none', 'No access'),
         ('read', 'Can read'),
         ('write', 'Can write')],
        required=True, default='read')
    article_permission = fields.Selection(
        related='article_id.inherited_permission',
        store=True)
    has_higher_permission = fields.Boolean(
        compute='_compute_has_higher_permission',
        help="If True, the member has a higher permission then the one set on the article. "
             "Used to check if user will upgrade its own permission (should not) "
             "and remove the 'Remove Member' button in the permission panel if this is not the case.")

    _sql_constraints = [
        ('partner_unique', 'unique(article_id, partner_id)', 'You already added this partner on this article.')
    ]

    @api.constrains('article_permission', 'permission')
    def _check_member(self, on_unlink=False):
        """
        An article should always be available for update (aka: inherit write permission, or a member with write access).
        Since this constraint only triggers if we have at least one member on the article, another validation is done in
        'knowledge.article' model. The article_permission related field has been added and stored to force triggering
        this constraint when article.permission is modified.
        :param on_unlink: (Boolean) When called on unlink, we must remove the members in self
            (the ones that will be deleted) to check if one of the remaining members has write access.
        """
        articles_to_check = self.article_id.filtered(lambda a: a.inherited_permission != 'write')
        if not articles_to_check:
            return

        if on_unlink:
            deleted_members_by_article = dict.fromkeys(articles_to_check.ids, self.env['knowledge.article.member'])
            for member in self.filtered(lambda member: member.article_id in articles_to_check):
                deleted_members_by_article[member.article_id.id] |= member

        parents_members_permission = articles_to_check.parent_id._get_article_member_permissions()
        for article in articles_to_check:
            # Check on permission on members
            members_to_check = article.article_member_ids
            if on_unlink:
                members_to_check -= deleted_members_by_article[article.id]
            if any(m.permission == 'write' for m in members_to_check):
                continue

            # we need to add the members on parents to check the validity
            parent_write_members = any(
                values['permission'] == 'write' for partner_id, values
                in parents_members_permission[article.parent_id.id].items()
                if article.parent_id and not article.is_desynchronized
                and partner_id not in article.article_member_ids.partner_id.ids
            )

            if not parent_write_members:
                raise ValidationError(
                    _("Article '%s' should always be available for update: inherit write permission, or have a member with write access)",
                      article.display_name)
                )

    @api.constrains('partner_id', 'permission')
    def _check_external_member_permission(self):
        for member in self:
            if member.partner_id.partner_share and member.permission == 'write':
                raise ValidationError(_("The external user %s cannot have a 'write' permission on article '%s'", member.partner_id.display_name, member.article_id.display_name))

    @api.depends("article_id", "permission")
    def _compute_has_higher_permission(self):
        articles_permission = self.article_id._get_internal_permission()
        for member in self:
            member.has_higher_permission = ARTICLE_PERMISSION_LEVEL[member.permission] > ARTICLE_PERMISSION_LEVEL[articles_permission[member.article_id.ids[0]]]

    def init(self):
        self._cr.execute("CREATE INDEX IF NOT EXISTS knowledge_article_member_article_partner_idx ON knowledge_article_member (article_id, partner_id)")

    @api.ondelete(at_uninstall=False)
    def _unlink_except_no_writer(self):
        """ When removing a member, the constraint is not triggered.
        We need to check manually on article with no write permission that we do not remove the last write member """
        self._check_member(on_unlink=True)

    def _get_invitation_hash(self):
        """ We use a method instead of a field in order to reduce DB space."""
        self.ensure_one()
        return tools.hmac(self.env(su=True),
                          'knowledge-article-invite',
                          f'{self.id}-{self.create_date}-{self.partner_id.id}-{self.article_id.id}'
                         )
