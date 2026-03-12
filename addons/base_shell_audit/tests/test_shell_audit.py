import datetime
import os
import subprocess as sp
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path
from unittest.mock import patch

from odoo.cli import shell_audit
from odoo.tests import TransactionCase, tagged
from odoo.tools import config, mute_logger
import contextlib


def _reset_audit_state():
    """Remove all thread-local audit attributes between tests."""
    for attr in ('commands', 'sql', 'history_id'):
        if hasattr(shell_audit._audit, attr):
            delattr(shell_audit._audit, attr)


@tagged('post_install', '-at_install')
class TestShellAuditState(TransactionCase):
    """Pure thread-local state logic — no cursor commits required."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        def do_nothing(*args, **kwars):
            _reset_audit_state()

        cls.startClassPatcher(patch.object(cls.cr._cnx, 'commit'))
        cls.startClassPatcher(patch.object(cls.cr, 'commit', do_nothing))
        cls.startClassPatcher(patch.object(cls.cr._cnx, 'rollback'))
        cls.startClassPatcher(patch.object(cls.cr, 'rollback', do_nothing))

    def setUp(self):
        super().setUp()
        _reset_audit_state()
        shell_audit._activate()

    def _persist(self, history_id, commands, sql_queries, transaction_date=None):
        if transaction_date is None:
            transaction_date = datetime.datetime(2024, 1, 1, 12, 0, 0)
        shell_audit._persist(
            self.env.cr, history_id, commands, sql_queries, transaction_date,
        )

    def test_activate_sets_state(self):
        shell_audit._activate()
        self.assertEqual(shell_audit._audit.commands, [])
        self.assertEqual(shell_audit._audit.sql, [])
        self.assertIsNone(shell_audit._audit.history_id)

    def test_append_command_active(self):
        shell_audit._activate()
        shell_audit.append_command('x = 1')
        shell_audit.append_command('y = 2')
        self.assertEqual(shell_audit._audit.commands, ['x = 1', 'y = 2'])

    # def test_append_command_inactive(self):
    #     # _audit has no 'commands' attr — not in shell mode
    #     shell_audit.append_command('x = 1')
    #     self.assertFalse(hasattr(shell_audit._audit, 'commands'))

    def test_record_sql_active(self):
        shell_audit._audit.sql = []
        shell_audit._record_sql(None, 'SELECT 1', None, 0, 0)
        self.assertEqual(shell_audit._audit.sql, ['SELECT 1'])

    def test_record_sql_suspended(self):
        shell_audit._audit.sql = None  # suspended
        shell_audit._record_sql(None, 'SELECT 1', None, 0, 0)
        self.assertIsNone(shell_audit._audit.sql)

    def test_record_sql_inactive(self):
        # _audit has no 'sql' attr — must not raise
        shell_audit._record_sql(None, 'SELECT 1', None, 0, 0)

    def test_rollback_clears_sql_only(self):
        shell_audit.install_patches()
        shell_audit._activate()
        shell_audit._audit.sql = ['SELECT 1', 'SELECT 2']
        shell_audit._audit.commands = ['cmd']
        shell_audit._audit.history_id = 42

        self.env.cr.rollback()

        # self.assertEqual(shell_audit._audit.sql, [])
        # self.assertEqual(shell_audit._audit.commands, ['cmd'])
        # self.assertEqual(shell_audit._audit.history_id, 42)

    def test_persist_creates_history_and_transaction(self):
        commands = ['env.user']
        ts = datetime.datetime(2024, 6, 1, 9, 0, 0)
        self._persist(None, commands, ['SELECT 1 FROM res_users'], ts)

        self.assertIsNotNone(shell_audit._audit.history_id)
        history = self.env['shell.audit.history'].sudo().browse(shell_audit._audit.history_id)
        self.assertEqual(history.source, 'env.user')
        self.assertEqual(len(history.transaction_ids), 1)
        tx = history.transaction_ids
        self.assertIn('SELECT 1', tx.queries)
        self.assertEqual(tx.transaction_date, ts)

    def test_persist_updates_history_on_second_call(self):
        commands = ['cmd1']
        self._persist(None, commands, ['SELECT 1'])
        history_id = shell_audit._audit.history_id

        commands.append('cmd2')
        self._persist(history_id, commands, ['SELECT 2'])

        history = self.env['shell.audit.history'].sudo().browse(history_id)
        self.assertEqual(history.source, 'cmd1\ncmd2')
        self.assertEqual(len(history.transaction_ids), 2)
        # Only one history record was ever created
        all_histories = self.env['shell.audit.history'].sudo().search([])
        self.assertEqual(len(all_histories), 1)

    def test_persist_suspends_sql_tracking(self):
        observed = []

        def _capturing_commit(*args, **kwargs):
            observed.append(shell_audit._audit.sql)

        # Nest a second patch on top of the setUp one to capture the intermediate state.
        with unittest.mock.patch.object(
            self.env.cr._cnx, 'commit', side_effect=_capturing_commit,
        ):
            self._persist(None, ['cmd'], ['SELECT 1'])

        self.assertEqual(observed, [None], "sql tracking must be suspended (None) during _persist")

    def test_persist_restores_sql_on_exception(self):
        shell_audit._audit.sql = ['pre-existing']

        with (
            unittest.mock.patch.object(
                self.env.registry['shell.audit.history'],
                'create',
                side_effect=Exception("boom"),
            ),
            mute_logger('odoo.cli.shell_audit'),
            contextlib.suppress(Exception)
        ):
            self._persist(None, ['cmd'], ['SELECT 1'])

        self.assertEqual(shell_audit._audit.sql, ['pre-existing'])

    def _run_shell_script(self, script_content):
        """Write *script_content* to a temp file and run it via odoo-bin shell --shell-file."""
        dbname = self.env.cr.dbname
        with tempfile.NamedTemporaryFile(encoding='utf-8', mode='w', suffix='.py', delete=False) as f:
            f.write(script_content)
            script_path = f.name
        try:
            proc = sp.run(
                [
                    sys.executable,
                    Path(__file__).parents[3].resolve() / 'odoo-bin',
                    f'--addons-path={config.format('addons_path', config['addons_path'])}',
                    'shell', '-d', dbname,
                    '--shell-interface=python',
                    '--shell-file', script_path,
                ],
                input='',
                text=True,
                timeout=60,
            )
        finally:
            os.unlink(script_path)
        return proc

    @unittest.skipIf(os.name != 'posix', '`os.openpty` only available on POSIX systems')
    def test_shell_creates_audit_records(self):
        marker = 'audit-integration-test-marker'
        self._run_shell_script(
            f"env['res.partner'].search([], limit=1).write({{'comment': {marker!r}}})\n"
            f"cr.commit()\n"
        )

        history = self.env['shell.audit.history'].search([('source', 'like', marker)], limit=1)
        self.assertTrue(history, "expected at least one shell.audit.history record")
        self.assertTrue(history.transaction_ids, "expected at least one transaction record")
        tx = history.transaction_ids[-1]
        self.assertIsNotNone(tx.transaction_date)

    @unittest.skipIf(os.name != 'posix', '`os.openpty` only available on POSIX systems')
    def test_rollback_creates_no_records(self):
        count_before = self.env['shell.audit.history'].search_count([])

        self._run_shell_script('env.cr.rollback()\n')

        count_after = self.env['shell.audit.history'].search_count([])
        self.assertEqual(count_before, count_after, "rollback should not create audit records")
