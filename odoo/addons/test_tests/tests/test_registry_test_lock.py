# Part of Odoo. See LICENSE file for full copyright and licensing details.
import threading
import time
from unittest import SkipTest
from unittest.mock import patch

import psycopg2
from psycopg2.extensions import TRANSACTION_STATUS_INERROR, TRANSACTION_STATUS_INTRANS

import odoo.modules.module
from odoo.http import Controller, request, route
from odoo.tests import BaseCase, HttpCase, TransactionCase
from odoo.tests.case import TestCase
from odoo.tests.common import (
    ClassTransactionLost,
    RegistryTestLockReclaimed,
    _registry_test_lock,
    _super_send,
)
from odoo.tests.test_cursor import TestCursor, TestCursorInterrupted
from odoo.tools import mute_logger


def wait_for_injected_error(cr, timeout=10):
    """ Wait for the reclaim mechanism to put the transaction in error (see ``_reclaim_test_lock_and_fail``).
    Explicitly not awaiting ``TestCursor._interrupted`` because that opens a race-window with interleaving
    operations (e.g. the cursor close) on the request thread.
    """
    connection = cr._cnx._cursor._cnx
    deadline = time.monotonic() + timeout
    while connection.info.transaction_status != TRANSACTION_STATUS_INERROR:
        if time.monotonic() > deadline:
            raise TimeoutError
        time.sleep(0.01)


class TestReclaimTestLock(HttpCase):
    """ Attempt to break mutex handling around the test-cursor. """
    test_cursor_lock_timeout = 1

    @classmethod
    def _request_handler(cls, s, r, /, **kw):
        # Skips the forced timeout (10s) floor set by the upstream method.
        return _super_send(s, r, **kw)

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        class ReclaimController(Controller):
            @route('/test_tests/reclaim', type='http', auth='public', sitemap=False)
            def reclaim(self, **params):
                test = odoo.modules.module.current_test
                try:
                    test.request_work(request.env.cr)
                except Exception as e:
                    test.request_errors.append(e)
                    raise
                finally:
                    test.request_done.set()
                return ''

        cls.env.transaction.invalidate_ormcache('routing')
        cls.addClassCleanup(cls.env.transaction.invalidate_ormcache, 'routing')
        cls.cr.execute("CREATE TEMPORARY TABLE reclaim (name varchar)")
        cls.cr.execute("INSERT INTO reclaim VALUES ('classSetup')")

    def setUp(self):
        super().setUp()
        self.cr.execute("INSERT INTO reclaim VALUES ('instanceSetup')")
        self.lost_transaction = self.startPatcher(patch.object(type(self), '_lose_class_transaction'))

    def url_open_reclaimed(self, work):
        """ Assert ``work(cr)`` is abusing the test-lock. The flow is threaded through ``url_open``
        to run from a request thread. The HttpCase framework is expected to keep the test-transaction
        in a usable state.
        """
        self.request_work = work
        self.request_errors = []
        self.request_done = threading.Event()
        with (
            # not self.assertRaises: it rolls back a savepoint opened before the request, hiding what it left behind
            TestCase.assertRaises(self, RegistryTestLockReclaimed),
            self.assertLogs('odoo.tests.common', 'ERROR'),
            mute_logger('odoo.tools.misc', 'odoo.http', 'odoo.sql_db'),  # stack dump, errors of the request
        ):
            self.url_open('/test_tests/reclaim', timeout=1)
        self.assertTrue(self.request_done.wait(10))
        self.assertEqual(_registry_test_lock.owner, threading.get_ident())
        return self.request_errors

    def assertTransactionRestored(self):
        self.lost_transaction.assert_not_called()
        self.assertEqual(self.cr._cnx.info.transaction_status, TRANSACTION_STATUS_INTRANS)
        self.cr.execute("SELECT name FROM reclaim")
        self.assertEqual(self.cr.fetchall(), [('classSetup',)], "test and request work are rolled back to the class state")

    def test_query(self):
        """ Recover when a request thread outlives the test thread. """
        def work_query(cr):
            cr.execute("INSERT INTO reclaim VALUES ('request')")
            wait_for_injected_error(cr)
            cr.execute("SELECT 1")

        errors = self.url_open_reclaimed(work_query)
        self.assertEqual([type(e) for e in errors], [TestCursorInterrupted])
        self.assertTransactionRestored()

    def test_running_query(self):
        """ Recover when a request thread is stuck in a long-running query. """
        def work_running_query(cr):
            cr.execute("INSERT INTO reclaim VALUES ('request')")
            cr.execute("SELECT pg_sleep(30)")

        errors = self.url_open_reclaimed(work_running_query)
        self.assertEqual([type(e) for e in errors], [TestCursorInterrupted])
        self.assertIsInstance(errors[0].__cause__, psycopg2.errors.QueryCanceled)
        self.assertTransactionRestored()

    def test_query_in_savepoint(self):
        """ Recover when the request is interrupted inside ``cr.savepoint()``. """
        savepoint_opened = threading.Event()

        def work(cr):
            cr.execute("INSERT INTO reclaim VALUES ('request')")
            with cr.savepoint():
                savepoint_opened.set()
                cr.execute("INSERT INTO reclaim VALUES ('request in savepoint')")
                # wait for the injected error, so unwinding the savepoint doesn't race the injection
                wait_for_injected_error(cr)
                cr.execute("SELECT 1")

        errors = self.url_open_reclaimed(work)
        self.assertTrue(savepoint_opened.is_set(), "the savepoint should open before injecting faults")
        self.assertEqual([type(e) for e in errors], [TestCursorInterrupted])
        self.assertTransactionRestored()

    def test_running_query_in_savepoint(self):
        """ Recover when a request thread is stuck in a long-running query inside ``cr.savepoint()``. """
        savepoint_opened = threading.Event()

        def work(cr):
            cr.execute("INSERT INTO reclaim VALUES ('request')")
            with cr.savepoint():
                savepoint_opened.set()
                cr.execute("SELECT pg_sleep(30)")

        errors = self.url_open_reclaimed(work)
        self.assertTrue(savepoint_opened.is_set(), "the savepoint should open before injecting faults")
        self.assertEqual([type(e) for e in errors], [TestCursorInterrupted])
        self.assertTransactionRestored()

    def test_no_rollback(self):
        """ Recover when there is no savepoint on the request thread. """
        def work(cr):
            wait_for_injected_error(cr)
            # Bypass TestCursor.execute because it would create a savepoint (test_cursor._check_savepoint)
            # this test needs absent. The server refuses the query with transaction in error response.
            cr._obj.execute("SELECT 1")

        errors = self.url_open_reclaimed(work)
        self.assertEqual([type(e) for e in errors], [psycopg2.errors.InFailedSqlTransaction])
        self.assertTransactionRestored()


class TestReclaimTestLockPdfRender(TransactionCase):
    """ Attempt to break mutex handling around the test-cursor.
    Unlike ``HttpCase``, the registry test mode is entered and left around the call.
    """
    test_cursor_lock_timeout = 1

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.cr.execute("CREATE TEMPORARY TABLE reclaim (name varchar)")
        cls.cr.execute("INSERT INTO reclaim VALUES ('classSetup')")

    def setUp(self):
        super().setUp()
        self.cr.execute("INSERT INTO reclaim VALUES ('instanceSetup')")
        self.lost_transaction = self.startPatcher(patch.object(type(self), '_lose_class_transaction'))

    def allow_pdf_render_reclaimed(self, work):
        """ Assert ``work(cr)`` is abusing the test-lock from a request thread called by
        the render program.
        """
        errors = []
        opened = threading.Event()
        done = threading.Event()

        def request():
            try:
                with self.registry.cursor() as cr:
                    opened.set()
                    work(cr)
            except Exception as e:  # noqa: BLE001
                errors.append(e)
            finally:
                opened.set()
                done.set()

        def mock_request(report, args):
            threading.Thread(target=request).start()
            self.assertTrue(opened.wait(10))
            return b''

        with (
            patch.object(self.registry['ir.actions.report'], '_run_wkhtmltopdf', mock_request, create=True),
            # not self.assertRaises: it rolls back a savepoint opened before the request, hiding what it left behind
            TestCase.assertRaises(self, RegistryTestLockReclaimed),
            self.assertLogs('odoo.tests.common', 'ERROR'),
            mute_logger('odoo.tools.misc', 'odoo.sql_db'),  # stack dump, errors of the request
            self.allow_pdf_render(),
        ):
            # _run_wkhtmltopdf must be called because its patched versions compose injections from the
            # test framework. it's brittle to re-implement that functionality here.
            self.env['ir.actions.report']._run_wkhtmltopdf([])
        self.assertTrue(done.wait(10))
        self.assertEqual(_registry_test_lock.owner, threading.get_ident())
        self.assertFalse(type(self)._registry_patched, "the registry test mode is left")
        return errors

    def assertTransactionRestored(self):
        self.lost_transaction.assert_not_called()
        self.assertEqual(self.cr._cnx.info.transaction_status, TRANSACTION_STATUS_INTRANS)
        self.cr.execute("SELECT name FROM reclaim")
        self.assertEqual(self.cr.fetchall(), [('classSetup',)], "test and request work are rolled back to the class state")

    def test_request_outlives_render(self):
        """ Recover when a request thread outlives the render subprocess. """
        def work(cr):
            cr.execute("INSERT INTO reclaim VALUES ('request')")
            wait_for_injected_error(cr)
            cr.execute("SELECT 1")

        errors = self.allow_pdf_render_reclaimed(work)
        self.assertEqual([type(e) for e in errors], [TestCursorInterrupted])
        self.assertTransactionRestored()


class TestReclaimTestLockUnit(BaseCase):
    """ Behaviours of the reclaim machinery that need neither a database nor a request. """
    test_cursor_lock_timeout = 1

    def test_lose_class_transaction(self):
        """ Skip test methods when class has irrecoverably lost the database transaction. """
        class LostSuite(BaseCase):
            def test_method(self):
                pass

        LostSuite._lose_class_transaction("lost it for test")
        with self.assertRaises(SkipTest):
            LostSuite('test_method').setUp()
        self.assertTrue(LostSuite._transaction_lost)
        LostSuite.doClassCleanups()
        [(_exc_type, exc, _tb)] = LostSuite.tearDown_exceptions
        self.assertIsInstance(exc, ClassTransactionLost)
        self.assertFalse(LostSuite._transaction_lost)
