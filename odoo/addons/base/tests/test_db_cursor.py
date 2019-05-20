# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import unittest

import odoo
from odoo.sql_db import TestCursor
from odoo.tests import common
from odoo.tools.misc import mute_logger

ADMIN_USER_ID = common.ADMIN_USER_ID

def registry():
    return odoo.registry(common.get_db_name())


@common.tagged('standard', 'at_install')
class TestExecute(unittest.TestCase):
    """ Try cr.execute with wrong parameters """

    @mute_logger('odoo.sql_db')
    def test_execute_bad_params(self):
        """
        Try to use iterable but non-list or int params in query parameters.
        """
        with registry().cursor() as cr:
            with self.assertRaises(ValueError):
                cr.execute("SELECT id FROM res_users WHERE login=%s", 'admin')
            with self.assertRaises(ValueError):
                cr.execute("SELECT id FROM res_users WHERE id=%s", 1)
            with self.assertRaises(ValueError):
                cr.execute("SELECT id FROM res_users WHERE id=%s", '1')


class TestTestCursor(common.TransactionCase):
    @classmethod
    def setUpClass(cls):
        super(TestTestCursor, cls).setUpClass()
        r = registry()
        r.enter_test_mode(r.cursor())

    @classmethod
    def tearDownClass(cls):
        r = registry()
        r.test_cr.close()
        r.leave_test_mode()
        super(TestTestCursor, cls).tearDownClass()

    def setUp(self):
        super(TestTestCursor, self).setUp()
        self.record = self.env['res.partner'].create({'name': 'Foo'})

    def write(self, record, value):
            record.ref = value

    def towrite_flush(self, record):
            record.towrite_flush([record._fields['ref']])

    def check(self, record, value):
            self.assertEqual(record.read(['ref'])[0]['ref'], value)

    def test_single_cursor(self):
        """ Check the behavior of a single test cursor. """
        self.assertIsInstance(self.cr, TestCursor)
        self.write(self.record, 'A')
        # DLE P13: Writes are not directly applied in db unless towrite_flush is called, and if we want the update
        # to be commited, we need to call towrite_flush before the cr.commit()
        self.towrite_flush(self.record)
        self.cr.commit()

        self.write(self.record, 'B')
        self.towrite_flush(self.record)
        self.cr.rollback()
        self.check(self.record, 'A')

        self.write(self.record, 'C')
        self.towrite_flush(self.record)
        self.cr.rollback()
        self.check(self.record, 'A')

    def test_sub_commit(self):
        """ Check the behavior of a subcursor that commits. """
        self.assertIsInstance(self.cr, TestCursor)
        self.write(self.record, 'A')
        self.towrite_flush(self.record)
        self.cr.commit()

        self.write(self.record, 'B')
        self.towrite_flush(self.record)

        # check behavior of a "sub-cursor" that commits
        with self.registry.cursor() as cr:
            self.assertIsInstance(cr, TestCursor)
            record = self.record.with_env(self.env(cr=cr))
            self.check(record, 'B')
            self.write(record, 'C')
            self.towrite_flush(self.record)

        self.check(self.record, 'C')

        self.cr.rollback()
        self.check(self.record, 'A')

    def test_sub_rollback(self):
        """ Check the behavior of a subcursor that rollbacks. """
        self.assertIsInstance(self.cr, TestCursor)
        self.write(self.record, 'A')
        self.towrite_flush(self.record)
        self.cr.commit()

        self.write(self.record, 'B')
        self.towrite_flush(self.record)

        # check behavior of a "sub-cursor" that rollbacks
        with self.assertRaises(ValueError):
            with self.registry.cursor() as cr:
                self.assertIsInstance(cr, TestCursor)
                record = self.record.with_env(self.env(cr=cr))
                self.check(record, 'B')
                self.write(record, 'C')
                self.towrite_flush(self.record)
                raise ValueError(42)

        self.check(self.record, 'B')

        self.cr.rollback()
        self.check(self.record, 'A')
