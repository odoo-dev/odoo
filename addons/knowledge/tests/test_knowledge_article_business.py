# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta
from freezegun import freeze_time

from odoo import exceptions
from odoo.addons.knowledge.tests.common import KnowledgeCommonWData
from odoo.tests.common import tagged, users
from odoo.tools import mute_logger


@tagged('knowledge_internals', 'knowledge_management')
class TestKnowledgeArticleBusiness(KnowledgeCommonWData):
    """ Test business API and main methods. """

    @mute_logger('odoo.addons.base.models.ir_rule')
    @users('employee')
    def test_article_archive(self):
        """ Testing archive that should also archive children. """
        article_shared = self.article_shared.with_env(self.env)
        article_workspace = self.article_workspace.with_env(self.env)
        wkspace_children = self.workspace_children.with_env(self.env)
        # to test descendants computation, add some sub children
        wkspace_grandchildren = self.env['knowledge.article'].create([
            {'name': 'Grand Children of workspace',
             'parent_id': wkspace_children[0].id,
            },
            {'name': 'Grand Children of workspace',
             'parent_id': wkspace_children[0].id,
            },
            {'name': 'Grand Children of workspace',
             'parent_id': wkspace_children[1].id,
            }
        ])
        wkspace_grandgrandchildren = self.env['knowledge.article'].create([
            {'name': 'Grand Grand Children of workspace',
             'parent_id': wkspace_grandchildren[1].id,
            },
            {'name': 'Grand Children of workspace',
             'parent_id': wkspace_grandchildren[2].id,
            },
        ])

        # no read access -> cracboum
        with self.assertRaises(exceptions.AccessError,
                               msg='Employee can read thus not archive'):
            article_shared.action_archive()

        # set the root + children inactive
        article_workspace.action_archive()
        self.assertFalse(article_workspace.active)
        for article in wkspace_children + wkspace_grandchildren + wkspace_grandgrandchildren:
            self.assertFalse(article.active, 'Archive: should propagate to children')

        # reset as active
        (article_workspace + wkspace_children + wkspace_grandchildren + wkspace_grandgrandchildren).toggle_active()
        for article in article_workspace + wkspace_children + wkspace_grandchildren + wkspace_grandgrandchildren:
            self.assertTrue(article.active)

        # set only part of tree inactive
        wkspace_children.action_archive()
        self.assertTrue(article_workspace.active)
        for article in wkspace_children + wkspace_grandchildren + wkspace_grandgrandchildren:
            self.assertFalse(article.active, 'Archive: should propagate to children')

    @mute_logger('odoo.addons.base.models.ir_rule')
    @users('employee')
    def test_article_archive_mixed_rights(self):
        """ Test archive in case of mixed rights """
        # give write access to shared section, but have children in read or none
        self.article_shared.article_member_ids.sudo().filtered(
            lambda article: article.partner_id == self.partner_employee
        ).write({'permission': 'write'})
        # one additional read child and one additional none child
        self.shared_children.article_member_ids.sudo().filtered(
            lambda article: article.partner_id == self.partner_employee
        ).write({'permission': 'read'})
        self.shared_children += self.env['knowledge.article'].sudo().create([
            {'article_member_ids': [
                (0, 0, {'partner_id': self.partner_admin.id,
                        'permission': 'write',
                       }),
                (0, 0, {'partner_id': self.partner_employee.id,
                        'permission': 'read',
                       }),
             ],
             'internal_permission': False,
             'name': 'Shared Child2',
             'parent_id': self.article_shared.id,
            },
            {'article_member_ids': [
                (0, 0, {'partner_id': self.partner_admin.id,
                        'permission': 'write',
                       }),
                (0, 0, {'partner_id': self.partner_employee.id,
                        'permission': 'none',
                       }),
             ],
             'internal_permission': False,
             'name': 'Shared Child3',
             'parent_id': self.article_shared.id,
            },
        ])

        article_shared = self.article_shared.with_env(self.env)
        shared_children = article_shared.child_ids
        self.assertEqual(shared_children,
                         self.shared_children.filtered(lambda article: article.name in ['Shared Child1', 'Shared Child2']),
                         'Should see only two first children')
        article_shared.action_archive()

    @mute_logger('odoo.addons.base.models.ir_rule')
    @users('employee')
    def test_article_create(self):
        """ Testing the helper to create articles with right values. """
        Article = self.env['knowledge.article']
        article = self.article_workspace.with_env(self.env)
        readonly_article = self.article_shared.with_env(self.env)
        self.assertTrue(readonly_article.user_has_access)
        self.assertFalse(readonly_article.user_can_write)

        _title = 'Fthagn'
        new = Article.article_create(title=_title, parent_id=False, is_private=False)
        self.assertFalse(new.article_member_ids)
        self.assertEqual(new.body, f'<h1>{_title}</h1>')
        self.assertEqual(new.category, 'workspace')
        self.assertEqual(new.internal_permission, 'write')
        self.assertEqual(new.name, _title)
        self.assertFalse(new.parent_id)
        self.assertEqual(new.sequence, self._base_sequence + 1)

        _title = 'Fthagn, but private'
        private = Article.article_create(title=_title, parent_id=False, is_private=True)
        self.assertEqual(private.article_member_ids.partner_id, self.env.user.partner_id)
        self.assertEqual(private.category, 'private')
        self.assertEqual(private.internal_permission, 'none')
        self.assertFalse(private.parent_id)
        self.assertEqual(private.sequence, self._base_sequence + 2)

        _title = 'Fthagn, but with parent (workspace)'
        child = Article.article_create(title=_title, parent_id=article.id, is_private=False)
        self.assertFalse(child.article_member_ids)
        self.assertEqual(child.category, 'workspace')
        self.assertFalse(child.internal_permission)
        self.assertEqual(child.parent_id, article)
        self.assertEqual(child.sequence, 2, 'Already two children existing')

        _title = 'Fthagn, but with parent (private): forces private'
        child_private = Article.article_create(title=_title, parent_id=private.id, is_private=False)
        self.assertFalse(child_private.article_member_ids)
        self.assertEqual(child_private.category, 'private')
        self.assertFalse(child_private.internal_permission)
        self.assertEqual(child_private.parent_id, private)
        self.assertEqual(child_private.sequence, 0)

        _title = 'Fthagn, but private under non private: cracboum'
        with self.assertRaises(exceptions.ValidationError):
            Article.article_create(title=_title, parent_id=article.id, is_private=True)

        _title = 'Fthagn, but with parent read only: cracboum'
        with self.assertRaises(exceptions.AccessError):
            Article.article_create(title=_title, parent_id=readonly_article.id, is_private=False)

        private_nonmember = Article.sudo().create({
            'article_member_ids': [
                (0, 0, {'partner_id': self.partner_employee2.id,
                        'permission': 'write',}),
                (0, 0, {'partner_id': self.partner_employee.id,
                        'permission': 'none',}),
            ],
            'internal_permission': 'none',
            'name': 'AdminPrivate',
        })
        _title = 'Fthagn, but with parent private none: cracboum'
        with self.assertRaises(exceptions.AccessError):
            Article.article_create(title=_title, parent_id=private_nonmember.id, is_private=False)

    @mute_logger('odoo.addons.base.models.ir_rule', 'odoo.addons.mail.models.mail_mail')
    @users('employee')
    def test_article_invite_members(self):
        shared_children = self.shared_children.with_env(self.env)
        self.assertMembers(shared_children, False,
                           {self.partner_admin: 'write',
                            self.partner_employee: 'write'})

        # invite a mix of shared and internal people
        partners = (self.customer + self.partner_employee_manager + self.partner_employee2).with_env(self.env)
        with self.mock_mail_gateway():
            shared_children.invite_members(partners, 'write')
        self.assertMembers(shared_children, False,
                           {self.partner_admin: 'write',
                            self.partner_employee: 'write',
                            self.customer: 'read',  # shared partners are always read only
                            self.partner_employee_manager: 'write',
                            self.partner_employee2: 'write'})

        # employee2 is downgraded, employee_manager is removed
        with self.mock_mail_gateway():
            shared_children.invite_members(partners[2], 'read')
        with self.mock_mail_gateway():
            shared_children.invite_members(partners[1], 'none')

        self.assertMembers(shared_children, False,
                           {self.partner_admin: 'write',
                            self.partner_employee: 'write',
                            self.customer: 'read',
                            self.partner_employee_manager: 'none',
                            self.partner_employee2: 'read'})

    @mute_logger('odoo.addons.base.models.ir_rule', 'odoo.addons.mail.models.mail_mail')
    @users('employee')
    def test_article_invite_members_rights(self):
        article_shared = self.article_shared.with_env(self.env)
        self.assertFalse(article_shared.user_can_write)

        partners = (self.customer + self.partner_employee_manager + self.partner_employee2).with_env(self.env)
        with self.assertRaises(exceptions.AccessError,
                               msg='Invite: cannot invite with read permission'):
            article_shared.invite_members(partners, 'write')

    @users('employee')
    def test_article_toggle_favorite(self):
        """ Testing the API for togging favorites. """
        playground_articles = (self.article_workspace + self.workspace_children).with_env(self.env)
        self.assertEqual(playground_articles.mapped('is_user_favorite'), [False, False, False])

        playground_articles[0].action_toggle_favorite()
        playground_articles.invalidate_cache(fnames=['is_user_favorite'])
        self.assertEqual(playground_articles.mapped('is_user_favorite'), [True, False, False])

        # correct uid-based computation
        playground_articles_asmanager = playground_articles.with_user(self.user_employee_manager)
        self.assertEqual(playground_articles_asmanager.mapped('is_user_favorite'), [False, False, False])

    @users('employee')
    def test_article_move_to(self):
        """ Testing the API for moving articles. """
        article_workspace = self.article_workspace.with_env(self.env)
        article_shared = self.article_shared.with_env(self.env)
        workspace_children = self.workspace_children.with_env(self.env)

        with self.assertRaises(exceptions.AccessError,
                               msg='Cannot move under readonly parent'):
            workspace_children[0].move_to(parent_id=article_shared.id)
        with self.assertRaises(exceptions.AccessError,
                               msg='Cannot move a readonly article'):
            article_shared[0].move_to(parent_id=article_workspace.id)
        with self.assertRaises(exceptions.AccessError,
                               msg='Cannot move a readonly article (even out of any hierarchy)'):
            article_shared[0].move_to(parent_id=False)

        # valid move: put second child of workspace under the first one
        workspace_children[1].move_to(parent_id=workspace_children[0].id)
        workspace_children.flush()
        self.assertEqual(article_workspace.child_ids, workspace_children[0])
        self.assertEqual(article_workspace._get_descendants(), workspace_children)
        self.assertEqual(workspace_children.root_article_id, article_workspace)
        self.assertEqual(workspace_children[1].parent_id, workspace_children[0])
        self.assertEqual(workspace_children[0].parent_id, article_workspace)

        # other valid move: first child is moved to private section
        workspace_children[0].move_to(parent_id=False, is_private=True)
        workspace_children.flush()
        self.assertMembers(workspace_children[0], 'none', {self.partner_employee: 'write'})
        self.assertEqual(workspace_children[0].category, 'private')
        self.assertEqual(workspace_children[0].internal_permission, 'none')
        self.assertFalse(workspace_children[0].parent_id)
        self.assertEqual(workspace_children.root_article_id, workspace_children[0])


@tagged('knowledge_internals')
class TestKnowledgeArticleFields(KnowledgeCommonWData):
    """ Test fields and their management. """

    @users('employee')
    def test_fields_edition(self):
        _reference_dt = datetime(2022, 5, 31, 10, 0, 0)
        body_values = [False, '', '<p><br /></p>', '<p>MyBody</p>']

        for index, body in enumerate(body_values):
            self.patch(self.env.cr, 'now', lambda: _reference_dt)
            with freeze_time(_reference_dt):
                article = self.env['knowledge.article'].create({
                    'body': body,
                    'internal_permission': 'write',
                    'name': 'MyArticle,'
                })
            self.assertEqual(article.last_edition_uid, self.env.user)
            self.assertEqual(article.last_edition_date, _reference_dt)

            self.patch(self.env.cr, 'now', lambda: _reference_dt + timedelta(days=1))

            # fields that does not change content
            with freeze_time(_reference_dt + timedelta(days=1)):
                article.with_user(self.user_employee2).write({
                    'name': 'NoContentEdition'
                })
            self.assertEqual(article.last_edition_uid, self.env.user)
            self.assertEqual(article.last_edition_date, _reference_dt)

            # fields that change content
            with freeze_time(_reference_dt + timedelta(days=1)):
                article.with_user(self.user_employee2).write({
                    'body': body_values[(index + 1) if index < (len(body_values)-1) else 0]
                })
                article.with_user(self.user_employee2).flush()
            self.assertEqual(article.last_edition_uid, self.user_employee2)
            self.assertEqual(article.last_edition_date, _reference_dt + timedelta(days=1))


@tagged('knowledge_internals', 'knowledge_management')
class TestKnowledgeCommonWDataInitialValue(KnowledgeCommonWData):
    """ Test initial values or our test data once so that other tests do not have
    to do it. """

    def test_initial_values(self):
        """ Ensure all tests have the same basis (global values computed as root) """
        # root
        article_workspace = self.article_workspace
        self.assertTrue(article_workspace.category, 'workspace')
        self.assertEqual(article_workspace.sequence, 999)
        article_shared = self.article_shared
        self.assertTrue(article_shared.category, 'shared')
        self.assertTrue(article_shared.sequence, 998)

        # workspace children
        workspace_children = article_workspace.child_ids
        self.assertEqual(
            workspace_children.mapped('inherited_permission'),
            ['write', 'write']
        )
        self.assertEqual(workspace_children.inherited_permission_parent_id, article_workspace)
        self.assertEqual(
            workspace_children.mapped('internal_permission'),
            [False, False]
        )
        self.assertEqual(workspace_children.root_article_id, article_workspace)
        self.assertEqual(workspace_children.mapped('sequence'), [0, 1])

    @users('employee')
    def test_initial_values_as_employee(self):
        """ Ensure all tests have the same basis (user specific computed as
        employee for acl-dependent tests) """
        article_workspace = self.article_workspace.with_env(self.env)
        self.assertTrue(article_workspace.user_has_access)
        self.assertTrue(article_workspace.user_can_write)

        article_shared = self.article_shared.with_env(self.env)
        self.assertTrue(article_shared.user_has_access)
        self.assertFalse(article_shared.user_can_write)


@tagged('post_install', '-at_install', 'knowledge_internals', 'knowledge_management')
class TestKnowledgeShare(KnowledgeCommonWData):
    """ Test share feature. """

    @mute_logger('odoo.addons.mail.models.mail_mail', 'odoo.models.unlink', 'odoo.tests')
    @users('employee2')
    def test_knowledge_article_share(self):
        # private article of "employee manager"
        knowledge_article_sudo = self.env['knowledge.article'].sudo().create({
            'name': 'Test Article',
            'body': '<p>Content</p>',
            'internal_permission': 'none',
            'article_member_ids': [(0, 0, {
                'partner_id': self.partner_employee_manager.id,
                'permission': 'write',
            })],
        })

        # employee2 is not supposed to be able to share it
        with self.assertRaises(exceptions.AccessError):
            self._knowledge_article_share(
                knowledge_article_sudo,
                self.partner_portal.ids,
                'read',
            )

        # give employee2 read access on the document
        knowledge_article_sudo.write({
            'article_member_ids': [(0, 0, {
                'partner_id': self.partner_employee2.id,
                'permission': 'read',
            })]
        })

        # still not supposed to be able to share it
        with self.assertRaises(exceptions.AccessError):
            self._knowledge_article_share(
                knowledge_article_sudo,
                self.partner_portal.ids,
                'read',
            )

        # modify employee2 access to write
        knowledge_article_sudo.article_member_ids.filtered(
            lambda member: member.partner_id == self.partner_employee2
        ).write({'permission': 'write'})

        # now they should be able to share it
        self._knowledge_article_share(
            knowledge_article_sudo,
            self.partner_portal.ids,
            'read',
        )

        # check that portal user received an invitation link
        invitation_message = self.env['mail.message'].search([
            ('partner_ids', 'in', self.partner_portal.id)
        ])
        self.assertEqual(len(invitation_message), 1)
        self.assertIn(
            knowledge_article_sudo._get_invite_url(self.partner_portal),
            invitation_message.body
        )

        with self.with_user('portal_test'):
            # portal should now have read access to the article
            # (re-browse to have the current user context for user_permission)
            self.assertEqual(
                self.env['knowledge.article'].browse(knowledge_article_sudo.id).user_permission,
                'read')

    def _knowledge_article_share(self, article, partner_ids, permission='write'):
        """ Re-browse the article to make sure we have the current user context on it.
        Necessary for all access fields compute methods in knowledge.article. """

        return self.env['knowledge.invite'].sudo().create({
            'article_id': self.env['knowledge.article'].browse(article.id).id,
            'partner_ids': partner_ids,
        }).action_invite_members()
