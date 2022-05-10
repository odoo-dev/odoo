# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.knowledge.tests.common import KnowledgeCommonWData
from odoo.tests.common import tagged, users, warmup


@tagged('knowledge_performance', 'post_install', '-at_install')
class KnowledgePerformanceCase(KnowledgeCommonWData):

    def setUp(self):
        super().setUp()
        # patch registry to simulate a ready environment
        self.patch(self.env.registry, 'ready', True)
        self._flush_tracking()

    def _flush_tracking(self):
        """ Force the creation of tracking values notably, and ensure tests are
        reproducible. """
        self.env['base'].flush()
        self.cr.flush()

    @users('employee')
    @warmup
    def test_article_creation_single_shared_grandchild(self):
        """ Test with 2 levels of hierarchy in a private/shared environment """
        with self.assertQueryCount(employee=20):
            _article = self.env['knowledge.article'].create({
                'body': '<p>Hello</p>',
                'name': 'Article in shared',
                'parent_id': self.shared_children[0].id,
            })

        self.assertEqual(_article.category, 'shared')

    @users('employee')
    @warmup
    def test_article_creation_single_workspace(self):
        with self.assertQueryCount(employee=17):
            _article = self.env['knowledge.article'].create({
                'body': '<p>Hello</p>',
                'name': 'Article in workspace',
                'parent_id': self.article_workspace.id,
            })

        self.assertEqual(_article.category, 'workspace')

    @users('employee')
    @warmup
    def test_article_creation_multi_roots(self):
        with self.assertQueryCount(employee=33):
            _article = self.env['knowledge.article'].create([
                {'body': '<p>Hello</p>',
                 'internal_permission': 'write',
                 'name': f'Article {index} in workspace',
                }
                for index in range(10)
            ])

    @users('employee')
    @warmup
    def test_article_creation_multi_shared_grandchild(self):
        with self.assertQueryCount(employee=56):
            _article = self.env['knowledge.article'].create([
                {'body': '<p>Hello</p>',
                 'name': f'Article {index} in workspace',
                 'parent_id': self.shared_children[0].id,
                }
                for index in range(10)
            ])

    @users('employee')
    @warmup
    def test_article_favorite(self):
        with self.assertQueryCount(employee=8):  # knowledge only: 7
            article = self.shared_children.with_env(self.env)
            article.action_toggle_favorite()

    @users('employee')
    @warmup
    def test_article_invite_members(self):
        with self.assertQueryCount(employee=109):
            article = self.shared_children.with_env(self.env)
            partners = (self.customer + self.partner_employee_manager + self.partner_employee2).with_env(self.env)
            article.invite_members(partners, 'write')

    @users('employee')
    @warmup
    def test_article_move_to(self):
        before_id = self.workspace_children[0].id
        with self.assertQueryCount(employee=18):
            article = self.workspace_children[1].with_env(self.env)
            article.move_to(parent_id=article.parent_id.id, before_article_id=before_id)
