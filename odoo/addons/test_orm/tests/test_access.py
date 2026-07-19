from contextlib import contextmanager
import functools
import re

from odoo import Command
from odoo.exceptions import AccessError
from odoo.tests import TransactionCase
from odoo.tools import mute_logger


class TestAccess(TransactionCase):
    MODEL = 'test_access_right.some_obj'

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.group1 = cls.env['res.groups'].create({'name': "Group 1"})
        cls.group2 = cls.env['res.groups'].create({'name': "Group 2"})
        cls.group3 = cls.env['res.groups'].create({'name': "Group 3"})

        # user belongs to Group 1, Group 2, but not to Group 3
        groups = cls.env.ref('base.group_user') + cls.group1 + cls.group2
        cls.user = cls.env['res.users'].create({
            'login': 'bob',
            'name': "Bob Bobman",
            'group_ids': [Command.set(groups.ids)],
        })

        # discard all existing access on model
        cls.env['ir.access'].search([('model_id', '=', cls.MODEL)]).unlink()

        # create records: Mario, Luigi, Peach, Toad, Yoshi, Bowser
        cls.records = cls.env[cls.MODEL].create([{}] * 6).with_user(cls.user)
        cls.mario, cls.luigi, cls.peach, cls.toad, cls.yoshi, cls.bowser = cls.records
        cls.model = cls.records.browse()

    def make_access(self, name="", records=None, group=None, operation='r', **kwargs):
        """ Create some access on records (or all records if None) """
        return self.env['ir.access'].create({
            'name': name,
            'model_id': self.env['ir.model']._get_id(self.MODEL),
            'group_id': group.id if group else False,
            'operation': operation,
            'domain': str([('id', 'in', records.ids)]) if records else False,
            **kwargs,
        })

    def assertAccess(self, allowed, operation='read'):
        self.assertTrue(self.model.has_access(operation))
        self.model.check_access(operation)

        for record in self.records:
            if record in allowed:
                self.assertTrue(record.has_access(operation))
                record.check_access(operation)
            else:
                self.assertFalse(record.has_access(operation))
                with self.assertAccessError():
                    record.check_access(operation)

        allowed.check_access(operation)

        if self.records - allowed:
            with self.assertAccessError():
                self.records.check_access(operation)

        self.assertEqual(self.records._filtered_access(operation), allowed)

    @contextmanager
    def assertAccessError(self, message=None):
        with mute_logger('odoo.addons.base.models.ir_access'):
            if message:
                with self.assertRaisesRegex(AccessError, re.compile(message, re.S)):
                    yield
            else:
                with self.assertRaises(AccessError):
                    yield

    def test_for_fields(self):
        access = self.make_access(self.records, operation='ru')
        self.assertTrue(access.for_read)
        self.assertTrue(access.for_write)
        self.assertFalse(access.for_create)
        self.assertFalse(access.for_unlink)

        access.operation = 'cr'
        self.assertTrue(access.for_read)
        self.assertFalse(access.for_write)
        self.assertTrue(access.for_create)
        self.assertFalse(access.for_unlink)

        access.for_write = True
        access.for_create = False
        self.assertEqual(access.operation, 'ru')

    def test_sudo(self):
        records = self.records.sudo()

        self.assertTrue(records.has_access('read'))
        self.assertTrue(records.has_access('write'))
        self.assertTrue(records.has_access('create'))
        self.assertTrue(records.has_access('unlink'))

        self.assertEqual(records._filtered_access('read'), records)
        self.assertEqual(records._filtered_access('write'), records)
        self.assertEqual(records._filtered_access('create'), records)
        self.assertEqual(records._filtered_access('unlink'), records)

        records.check_access('read')
        records.check_access('write')
        records.check_access('create')
        records.check_access('unlink')

    def test_no_access(self):
        self.assertFalse(self.records.has_access('read'))
        self.assertFalse(self.records.has_access('write'))
        self.assertFalse(self.records.has_access('create'))
        self.assertFalse(self.records.has_access('unlink'))

        self.assertFalse(self.records._filtered_access('read'))
        self.assertFalse(self.records._filtered_access('write'))
        self.assertFalse(self.records._filtered_access('create'))
        self.assertFalse(self.records._filtered_access('unlink'))

        with self.assertAccessError():
            self.records.check_access('read')
        with self.assertAccessError():
            self.records.check_access('write')
        with self.assertAccessError():
            self.records.check_access('create')
        with self.assertAccessError():
            self.records.check_access('unlink')

    def test_no_permission_one_restriction(self):
        self.make_access(records=self.records)

        self.assertFalse(self.model.has_access('read'))
        self.assertFalse(self.model.has_access('write'))

        self.assertFalse(self.records._filtered_access('read'))
        self.assertFalse(self.records._filtered_access('write'))

        with self.assertAccessError():
            self.model.check_access('read')
        with self.assertAccessError():
            self.model.check_access('write')
        with self.assertAccessError():
            self.records.check_access('read')

    def test_one_permission(self):
        # read access, write access on humans
        humans = self.mario + self.luigi + self.peach
        self.make_access(group=self.group1, operation='r')
        self.make_access(records=humans, group=self.group1, operation='u')

        self.assertAccess(self.records, 'read')
        self.assertAccess(humans, 'write')

    def test_two_permissions_in_group(self):
        self.make_access(records=self.mario + self.luigi, group=self.group1)
        self.make_access(records=self.mario + self.peach, group=self.group1)

        # union of permissions
        self.assertAccess(self.mario + self.luigi + self.peach)

    def test_two_permissions_in_distinct_groups(self):
        self.make_access(records=self.mario + self.luigi, group=self.group1)
        self.make_access(records=self.mario + self.peach, group=self.group2)
        self.make_access(records=self.mario + self.yoshi, group=self.group3)

        # union of permissions
        self.assertAccess(self.mario + self.luigi + self.peach)

    def test_one_permission_one_restriction(self):
        self.make_access(records=self.mario + self.peach + self.bowser, group=self.group1)
        self.make_access(records=self.records - self.bowser)

        # union of permissions, intersection of restrictions
        self.assertAccess(self.mario + self.peach)

    def test_two_permissions_one_restriction(self):
        self.make_access(records=self.mario + self.luigi + self.bowser, group=self.group1)
        self.make_access(records=self.mario + self.peach + self.bowser, group=self.group2)
        self.make_access(records=self.records - self.bowser)

        # union of permissions, intersection of restrictions
        self.assertAccess(self.mario + self.luigi + self.peach)

    def test_two_permissions_two_restrictions(self):
        self.make_access(records=self.mario + self.luigi + self.bowser, group=self.group1)
        self.make_access(records=self.mario + self.peach + self.bowser, group=self.group2)
        self.make_access(records=self.records - self.bowser)
        self.make_access(records=self.records - self.peach)

        # union of permissions, intersection of restrictions
        self.assertAccess(self.mario + self.luigi)

    def test_special_user_manager(self):
        # one partial permission, one full permission
        self.make_access(records=self.mario + self.luigi + self.bowser, group=self.group1)
        self.make_access(group=self.group2)
        # one restriction
        self.make_access(records=self.records - self.bowser)

        self.assertAccess(self.records - self.bowser)

    def test_special_restrict_operations(self):
        # full permission on all operations
        self.make_access(group=self.group1, operation='r')
        self.make_access(group=self.group2, operation='crud')
        # restriction on some operations
        self.make_access(records=self.records - self.bowser, operation='cud')

        self.assertAccess(self.records, operation='read')
        self.assertAccess(self.records - self.bowser, operation='write')
        self.assertAccess(self.records - self.bowser, operation='create')
        self.assertAccess(self.records - self.bowser, operation='unlink')

    def test_error_message_no_access(self):
        self.make_access(group=self.group3, operation='cd')

        # read, write: no access at all
        with self.assertAccessError(r"You are not allowed to access.*No group currently allows this operation"):
            self.records.check_access('read')
        with self.assertAccessError(r"You are not allowed to modify.*No group currently allows this operation"):
            self.records.check_access('write')

        # create, unlink: access in Group 3
        with self.assertAccessError(
            r"You are not allowed to create.*"
            r"This operation is allowed for the following groups:\s*- Group 3"
        ):
            self.records.check_access('create')
        with self.assertAccessError(
            r"You are not allowed to delete.*"
            r"This operation is allowed for the following groups:\s*- Group 3"
        ):
            self.records.check_access('unlink')

    def test_error_message_partial_access(self):
        humans = self.records[:3]
        self.make_access("Restrict to humans", records=humans, group=self.group1)

        self.assertEqual(self.records._filtered_access('read'), humans)

        with self.assertAccessError(
            r"Uh-oh.*"
            rf"Sorry, Bob Bobman \(id={self.user.id}\) doesn't have 'read' access to:\s*"
            r"- Object For Test Access Right \(test_access_right\.some_obj\)\s*"
            r"If you really"
        ):
            self.records.check_access('read')

        with self.debug_mode():
            with self.assertAccessError(
                r"Uh-oh.*"
                rf"Sorry, Bob Bobman \(id={self.user.id}\) doesn't have 'read' access to:\s*"
                rf"- Object For Test Access Right, {self.toad.display_name}.*"
                rf"- Object For Test Access Right, {self.yoshi.display_name}.*"
                rf"- Object For Test Access Right, {self.bowser.display_name}.*"
                r"Blame the following accesses:\s*"
                r"- Restrict to humans\s*"
                r"If you really"
            ):
                self.records.check_access('read')

    def test_error_message_restricted_access(self):
        humans = self.records[:3]
        self.make_access("See all", group=self.group1)
        self.make_access("Restrict to humans", records=humans)

        self.assertEqual(self.records._filtered_access('read'), humans)

        with self.assertAccessError(
            r"Uh-oh.*"
            rf"Sorry, Bob Bobman \(id={self.user.id}\) doesn't have 'read' access to:\s*"
            r"- Object For Test Access Right \(test_access_right\.some_obj\)\s*"
            r"If you really"
        ):
            self.records.check_access('read')

        with self.debug_mode():
            with self.assertAccessError(
                r"Uh-oh.*"
                rf"Sorry, Bob Bobman \(id={self.user.id}\) doesn't have 'read' access to:\s*"
                rf"- Object For Test Access Right, {self.toad.display_name}.*"
                rf"- Object For Test Access Right, {self.yoshi.display_name}.*"
                rf"- Object For Test Access Right, {self.bowser.display_name}.*"
                r"Blame the following accesses:\s*"
                r"- Restrict to humans\s*"
                r"If you really"
            ):
                self.records.check_access('read')

    def test_error_message_partial_and_restricted_access(self):
        humans = self.records[:3]
        self.make_access("See good guys", records=self.records[:5], group=self.group1)
        self.make_access("Restrict to humans", records=humans)

        self.assertEqual(self.records._filtered_access('read'), humans)

        with self.assertAccessError(
            r"Uh-oh.*"
            rf"Sorry, Bob Bobman \(id={self.user.id}\) doesn't have 'read' access to:\s*"
            r"- Object For Test Access Right \(test_access_right\.some_obj\)\s*"
            r"If you really"
        ):
            self.records.check_access('read')

        with self.debug_mode():
            with self.assertAccessError(
                r"Uh-oh.*"
                rf"Sorry, Bob Bobman \(id={self.user.id}\) doesn't have 'read' access to:\s*"
                rf"- Object For Test Access Right, {self.toad.display_name}.*"
                rf"- Object For Test Access Right, {self.yoshi.display_name}.*"
                rf"- Object For Test Access Right, {self.bowser.display_name}.*"
                r"Blame the following accesses:\s*"
                r"- See good guys\s*"
                r"- Restrict to humans\s*"
                r"If you really"
            ):
                self.records.check_access('read')

    def test_get_groups_with_access(self):
        recs = self.records
        get_groups_with_access = self.env['ir.access']._get_groups_with_access
        get_groups = functools.partial(get_groups_with_access, recs._name, 'read')
        self.assertFalse(get_groups())

        # simple group (self.group1.all_implied_by_ids == self.group1)
        self.make_access("Good guys", records=recs[:5], group=self.group1)
        self.assertEqual(get_groups(), self.group1)

        # using access operator (group everyone)
        Category = self.env['test_access_right.obj_categ']
        everyone = self.env.ref('base.group_everyone')
        comodel_groups = get_groups_with_access(Category._name, 'read')
        assert everyone not in comodel_groups

        rule = self.make_access("Delegated permission", group=everyone)
        rule.domain = str([('categ_id', 'access', 'read')])
        groups = get_groups()
        self.assertEqual(groups, self.group1 | comodel_groups)
        self.assertNotIn(everyone, groups, "Everyone should not be part of the group")

        # using access operator (restriced group)
        access_group = self.env.ref('base.group_user')
        rule.group_id = access_group
        self.assertEqual(get_groups(), self.group1 | (access_group.all_implied_by_ids & comodel_groups))

        # combining access, where access condition is necessary
        rule.group_id = everyone
        rule.domain = str(['&', ('categ_id', 'access', 'read'), ('id', '>', 5)])
        self.assertEqual(get_groups(), self.group1 | comodel_groups)

        # combining access, where access condition is not necessary
        rule.domain = str(['|', ('categ_id', 'access', 'read'), ('id', '>', 5)])
        self.assertEqual(get_groups(), self.group1 | everyone.all_implied_by_ids)

        # combining access, where access conditions are necessary
        comodel_groups_write = get_groups_with_access(Category._name, 'write')
        rule.domain = str(['&', ('categ_id', 'access', 'read'), ('categ_id', 'access', 'write')])
        self.assertEqual(get_groups(), self.group1 | (comodel_groups & comodel_groups_write))

        # combining access, where access condition is negated
        rule.domain = str(['&', ('categ_id', 'access', 'read'), '!', ('categ_id', 'access', 'write')])
        self.assertEqual(get_groups(), self.group1 | (comodel_groups - comodel_groups_write))

    def test_get_groups_with_access_inherits(self):
        """``_get_groups_with_access`` intersects parent groups only when
        ``_check_inherits_access`` is True.
        """
        Parent = self.env['test_access_right.some_obj']
        ChildCheck = self.env['test_access_right.inherits']
        ChildNoCheck = self.env['test_access_right.inherits_nocheck']
        IrAccess = self.env['ir.access']
        get_groups = IrAccess._get_groups_with_access

        IrAccess.search([
            ('model_id.model', 'in', [Parent._name, ChildCheck._name, ChildNoCheck._name]),
        ]).unlink()

        # child models: only group1; parent model: only group2
        for model_name in (ChildCheck._name, ChildNoCheck._name):
            IrAccess.create({
                'name': f'{model_name} group1',
                'model_id': self.env['ir.model']._get_id(model_name),
                'group_id': self.group1.id,
                'operation': 'r',
            })
        IrAccess.create({
            'name': 'parent group2',
            'model_id': self.env['ir.model']._get_id(Parent._name),
            'group_id': self.group2.id,
            'operation': 'r',
        })

        # default True: groups must also have parent access -> empty intersection
        self.assertFalse(get_groups(ChildCheck._name, 'read'))
        # False: parent access is ignored -> group1 remains
        self.assertEqual(get_groups(ChildNoCheck._name, 'read'), self.group1)

        # when the same group has access on both models, it is kept
        IrAccess.create({
            'name': 'parent group1',
            'model_id': self.env['ir.model']._get_id(Parent._name),
            'group_id': self.group1.id,
            'operation': 'r',
        })
        self.assertEqual(get_groups(ChildCheck._name, 'read'), self.group1)
        self.assertEqual(get_groups(ChildNoCheck._name, 'read'), self.group1)


class TestInheritsAccess(TransactionCase):
    """Tests for ``_check_inherits_access`` on ``_access_domain`` / ``ir.access``."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        Parent = cls.env['test_access_right.some_obj']
        cls.allowed = Parent.create({'val': 1})
        cls.forbidden = Parent.create({'val': -1})
        cls.env['ir.access'].create({
            'name': 'Forbid negatives',
            'model_id': cls.env['ir.model']._get_id(Parent._name),
            'operation': 'crud',
            'domain': "[('val', '>', 0)]",
        })

    def test_check_inherits_access_false(self):
        """``_check_inherits_access=False`` ignores parent ACL domains."""
        ChildCheck = self.env['test_access_right.inherits']
        ChildNoCheck = self.env['test_access_right.inherits_nocheck']
        children_check = ChildCheck.create([
            {'some_id': self.allowed.id},
            {'some_id': self.forbidden.id},
        ])
        children_nocheck = ChildNoCheck.create([
            {'some_id': self.allowed.id},
            {'some_id': self.forbidden.id},
        ])

        user = self.env.ref('base.public_user')
        check_env = children_check.with_user(user)
        nocheck_env = children_nocheck.with_user(user)

        # default True: parent restriction applies (forbidden parent is filtered out)
        self.assertEqual(
            check_env.search([('id', 'in', children_check.ids)], order='id'),
            children_check[0],
        )
        self.assertEqual(check_env._filtered_access('read'), children_check[0])

        # False: parent restriction is ignored, both child records remain visible
        self.assertEqual(
            nocheck_env.search([('id', 'in', children_nocheck.ids)], order='id'),
            children_nocheck,
        )
        self.assertEqual(nocheck_env._filtered_access('read'), children_nocheck)

    def test_check_inherits_access_no_parent_permission(self):
        """Without parent model permission, only ``_check_inherits_access=False`` keeps access."""
        ChildCheck = self.env['test_access_right.inherits']
        ChildNoCheck = self.env['test_access_right.inherits_nocheck']
        child_check = ChildCheck.create({'some_id': self.allowed.id})
        child_nocheck = ChildNoCheck.create({'some_id': self.allowed.id})

        self.env['ir.access'].search([
            ('model_id.model', '=', 'test_access_right.some_obj'),
        ]).unlink()

        user = self.env.ref('base.public_user')
        self.assertFalse(self.env['test_access_right.some_obj'].with_user(user).has_access('read'))
        self.assertFalse(child_check.with_user(user).has_access('read'))
        self.assertTrue(child_nocheck.with_user(user).has_access('read'))
        self.assertEqual(
            ChildNoCheck.with_user(user).search([('id', '=', child_nocheck.id)]),
            child_nocheck,
        )
        with mute_logger('odoo.addons.base.models.ir_access'), self.assertRaises(AccessError):
            ChildCheck.with_user(user).search([('id', '=', child_check.id)])
