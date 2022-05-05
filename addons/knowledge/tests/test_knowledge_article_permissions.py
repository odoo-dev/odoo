# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import exceptions
from odoo.addons.knowledge.tests.common import KnowledgeArticlePermissionsCase
from odoo.tests.common import tagged, users
from odoo.tools import mute_logger


@tagged('knowledge_acl')
class TestKnowledgeArticlePermissions(KnowledgeArticlePermissionsCase):

    def test_article_permissions_desync(self):
        """ Test computed fields based on permissions (independently from ACLs
        aka not user_permission, ...). Main use cases: desynchronized articles
        or articles without parents. """
        for (exp_inherited_permission,
             exp_inherited_permission_parent_id,
             exp_internal_permission
            ), article in zip(
                [('read', self.env['knowledge.article'], 'read'),
                 ('read', self.article_cornercases[0], False),
                 ('none', self.env['knowledge.article'], 'none'),
                 ('none', self.article_cornercases[2], False),
                 ('write', self.env['knowledge.article'], 'write'),
                 ('read', self.env['knowledge.article'], 'read'),
                ],
                self.article_cornercases + self.article_roots
            ):
            self.assertEqual(article.inherited_permission, exp_inherited_permission,
                             f'Permission: wrong inherit computation for {article.name}: {article.inherited_permission} instead of {exp_inherited_permission}')
            self.assertEqual(article.inherited_permission_parent_id, exp_inherited_permission_parent_id,
                             f'Permission: wrong inherit computation for {article.name}: {article.inherited_permission_parent_id.name} instead of {exp_inherited_permission_parent_id.name}')
            self.assertEqual(article.internal_permission, exp_internal_permission,
                             f'Permission: wrong inherit computation for {article.name}: {article.internal_permission} instead of {exp_internal_permission}')

    @mute_logger('odoo.addons.base.models.ir_rule')
    def test_article_permissions_inheritance_desync(self):
        """ Test desynchronize (and therefore member propagation that should be
        stopped). """
        article_desync = self.article_cornercases[0]
        self.assertMembers(article_desync, 'read', {self.partner_employee_manager: 'write'})

        # as employee w write perms
        article_desync = article_desync.with_user(self.user_employee_manager)
        article_desync.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])
        self.assertTrue(article_desync.user_can_write)
        self.assertTrue(article_desync.user_has_access)

        # as employee
        article_desync = article_desync.with_user(self.user_employee)
        article_desync.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])
        self.assertFalse(article_desync.user_can_write)
        self.assertTrue(article_desync.user_has_access)

        # as portal
        article_desync = article_desync.with_user(self.user_portal)
        article_desync.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])
        self.assertFalse(article_desync.user_can_write)
        # TDE FIXME: currently has access but should not, member check should stop at desync
        self.assertFalse(article_desync.user_has_access, 'Permissions: member rights should not be fetch on parents')

    @mute_logger('odoo.addons.base.models.ir_rule')
    @users('employee')
    def test_article_permissions_inheritance_employee(self):
        article_roots = self.article_roots.with_env(self.env)
        article_roots.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])

        # roots: based on internal permissions
        self.assertEqual(article_roots.mapped('user_can_write'), [True, False, False])
        self.assertEqual(article_roots.mapped('user_has_access'), [True, True, True])
        self.assertEqual(article_roots.mapped('user_permission'), ['write', 'read', 'read'])

        # write permission from ancestors
        article_write_ancestor = self.article_write_contents[2].with_env(self.env)
        article_write_ancestor.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])
        self.assertEqual(article_write_ancestor.inherited_permission, 'write')
        self.assertEqual(article_write_ancestor.inherited_permission_parent_id, self.article_roots[0])
        self.assertFalse(article_write_ancestor.internal_permission)
        self.assertEqual(article_write_ancestor.user_permission, 'write')

        # write permission from ancestors overridden by internal permission
        article_read_forced = self.article_write_contents[1].with_env(self.env)
        article_read_forced.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])
        self.assertEqual(article_read_forced.inherited_permission, 'read')
        self.assertFalse(article_read_forced.inherited_permission_parent_id)
        self.assertEqual(article_read_forced.internal_permission, 'read')
        self.assertEqual(article_read_forced.user_permission, 'read')

        # write permission from ancestors overridden by member permission
        article_read_member = self.article_write_contents[0].with_env(self.env)
        article_read_member.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])
        self.assertEqual(article_read_member.inherited_permission, 'write')
        self.assertEqual(article_read_member.inherited_permission_parent_id, self.article_roots[0])
        self.assertFalse(article_read_member.internal_permission)
        self.assertEqual(article_read_member.user_permission, 'read')

        # forced lower than base article perm (see 'Community Paranoïa')
        article_lower = self.article_read_contents[1].with_env(self.env)
        article_lower.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])
        self.assertEqual(article_lower.inherited_permission, 'write')
        self.assertFalse(article_lower.inherited_permission_parent_id)
        self.assertEqual(article_lower.internal_permission, 'write')
        self.assertEqual(article_lower.user_permission, 'read')

        # read permission from ancestors
        article_read_ancestor = self.article_read_contents[2].with_env(self.env)
        article_read_ancestor.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])
        self.assertEqual(article_read_ancestor.inherited_permission, 'read')
        self.assertEqual(article_read_ancestor.inherited_permission_parent_id, self.article_roots[1])
        self.assertFalse(article_read_ancestor.internal_permission)
        self.assertEqual(article_read_ancestor.user_permission, 'read')

        # permission denied
        article_none = self.article_read_contents[3].with_env(self.env)
        article_none.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])
        with self.assertRaises(exceptions.AccessError):
            article_none.name

    @mute_logger('odoo.addons.base.models.ir_rule')
    @users('portal_test')
    def test_article_permissions_inheritance_portal(self):
        article_roots = self.article_roots.with_env(self.env)
        article_roots.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])

        with self.assertRaises(exceptions.AccessError):
            article_roots.mapped('internal_permission')

        article_members = self.article_read_contents[0:2].with_env(self.env)
        article_members.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])
        self.assertEqual(article_members.mapped('inherited_permission'), ['write', 'write'])  # TDE: TOCHECK
        self.assertEqual(article_members.mapped('internal_permission'), ['write', 'write'])  # TDE: TOCHECK
        self.assertEqual(article_members.mapped('user_can_write'), [False, False], 'Portal: can never write')
        self.assertEqual(article_members.mapped('user_has_access'), [True, True], 'Portal: access through membership')
        self.assertEqual(article_members.mapped('user_permission'), ['read', 'read'])

    @users('employee')
    def test_article_permissions_employee_new_mode(self):
        """ Test transient / cache mode: computed fields without IDs, ... """
        article = self.env['knowledge.article'].new({'name': 'Transient'})
        self.assertFalse(article.inherited_permission)
        self.assertFalse(article.internal_permission)
        self.assertTrue(article.user_can_write)
        self.assertTrue(article.user_has_access)
        self.assertEqual(article.user_permission, 'write')

    def test_initial_values(self):
        article_roots = self.article_roots.with_env(self.env)
        article_headers = self.article_headers.with_env(self.env)
        (article_roots + article_headers).invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])

        # roots: defaults on write, inherited = internal
        self.assertEqual(article_roots.mapped('inherited_permission'), ['write', 'read', 'none'])
        self.assertFalse(article_roots.inherited_permission_parent_id)
        self.assertEqual(article_roots.mapped('internal_permission'), ['write', 'read', 'none'])

        # childs: allow void permission, inherited = go up to first defined permission
        self.assertEqual(article_headers.mapped('inherited_permission'), ['write', 'read', 'read'])
        self.assertEqual(
            [p.inherited_permission_parent_id for p in article_headers],
            [article_roots[0], article_roots[1], article_roots[1]]
        )
        self.assertEqual(article_headers.mapped('internal_permission'), [False, False, False])

    @users('employee')
    def test_initial_values_as_employee(self):
        """ Ensure all tests have the same basis (user specific computed as
        employee for acl-dependent tests) """
        article_write_inherit_as1 = self.article_write_contents[2].with_env(self.env)
        article_write_inherit_as1.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])

        # initial values: write through inheritance
        self.assertMembers(article_write_inherit_as1, False, {self.partner_portal: 'read'})
        self.assertFalse(article_write_inherit_as1.internal_permission)
        self.assertFalse(article_write_inherit_as1.is_desynchronized)
        self.assertTrue(article_write_inherit_as1.user_can_write)
        self.assertTrue(article_write_inherit_as1.user_has_access)
        article_write_inherit_as2 = article_write_inherit_as1.with_user(self.user_employee2)
        article_write_inherit_as2.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])
        self.assertTrue(article_write_inherit_as2.user_can_write)
        self.assertTrue(article_write_inherit_as2.user_has_access)


@tagged('knowledge_acl')
class TestKnowledgeArticlePermissionsTools(KnowledgeArticlePermissionsCase):

    @mute_logger('odoo.addons.base.models.ir_rule')
    @users('employee')
    def test_downgrade_internal_permission_none(self):
        article_as1 = self.article_write_contents[2].with_env(self.env)
        article_as2 = article_as1.with_user(self.user_employee2)

        # downgrade write global perm to read
        article_as1._set_internal_permission('none')
        article_as1.flush()  # ACLs are done using SQL
        self.assertMembers(
            article_as1, 'none',
            {self.partner_portal: 'read', self.env.user.partner_id: 'write'},
            'Permission: lowering permission adds current user in members to have write access'
        )
        self.assertTrue(article_as1.is_desynchronized)
        self.assertTrue(article_as1.user_can_write)
        self.assertTrue(article_as1.user_has_access)
        article_as2.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])
        with self.assertRaises(exceptions.AccessError):
            article_as2.body  # trigger ACLs

    @users('employee')
    def test_downgrade_internal_permission_read(self):
        article_as1 = self.article_write_contents[2].with_env(self.env)
        article_as2 = article_as1.with_user(self.user_employee2)

        # downgrade write global perm to read
        article_as1._set_internal_permission('read')
        article_as1.flush()  # ACLs are done using SQL
        self.assertMembers(
            article_as1, 'read',
            {self.partner_portal: 'read', self.env.user.partner_id: 'write'},
            'Permission: lowering permission adds current user in members to have write access'
        )
        self.assertTrue(article_as1.is_desynchronized)
        self.assertTrue(article_as1.user_can_write)
        self.assertTrue(article_as1.user_has_access)
        article_as2.invalidate_cache(fnames=['user_can_write', 'user_has_access', 'user_permission'])
        self.assertFalse(article_as2.user_can_write)
        self.assertTrue(article_as2.user_has_access)


@tagged('knowledge_acl')
class TestKnowledgeArticleSearch(KnowledgeArticlePermissionsCase):

    @users('employee')
    def test_article_main_parent(self):
        """ Test root article computation """
        article_roots = self.article_roots.with_env(self.env)

        articles_write = (self.article_write_contents + self.article_write_contents_children).with_env(self.env)
        self.assertEqual(articles_write.root_article_id, article_roots[0])

        articles_write = self.article_read_contents.with_env(self.env)
        self.assertEqual(articles_write.root_article_id, article_roots[1])

        # desynchornized still have a root (do as sudo)
        self.assertEqual(self.article_cornercases[0:2].root_article_id, article_roots[0])
        self.assertEqual(self.article_cornercases[2:4].root_article_id, article_roots[1])

    @users('employee')
    def test_article_search_employee(self):
        """ Test regular searches using permission-based ACLs """
        articles = self.env['knowledge.article'].search([])
        # not reachable: 'none', desynchronized 'none'
        expected = self.articles_all - self.article_read_contents[3]
        self.assertEqual(articles, expected,
                         'Search on main article: aka everything except "none"-based articles (additional: %s, missing: %s)' %
                         ((articles - expected).mapped('name'), (expected - articles).mapped('name'))
                        )

        articles = self.env['knowledge.article'].search([('root_article_id', '=', self.article_roots[0].id)])
        # TDE FIXME: 2 desynchronized are considered as writeable, should not (membership should not propagate)
        # expected = self.article_roots[0] + self.article_headers[0] + \
        #            self.article_write_contents + self.article_write_contents_children
        expected = self.article_roots[0] + self.article_headers[0] + \
                   self.article_write_contents + self.article_write_contents_children + self.article_cornercases[0:2]
        self.assertEqual(articles, expected,
                         'Search on main article: aka read access on read root + its children (additional: %s, missing: %s)' %
                         ((articles - expected).mapped('name'), (expected - articles).mapped('name'))
                        )

    @users('employee')
    def test_article_search_employee_method_based(self):
        """ Test search methods """
        # TDE FIXME: article_cornercases seems buggy
        articles = self.env['knowledge.article'].search([('user_can_write', '=', True)])
        expected = self.article_roots[0] + self.article_headers[0] + \
                   self.article_write_contents[2] + self.article_write_contents_children + \
                   self.article_read_contents[0] + self.article_cornercases[2:]
        self.assertEqual(articles, expected,
                         'Search on user_can_write: aka write access (FIXME: should not contain article_cornercases[0] (additional: %s, missing: %s)' %
                         ((articles - expected).mapped('name'), (expected - articles).mapped('name'))
                        )
