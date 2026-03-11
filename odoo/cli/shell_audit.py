"""
Shell audit: record Python commands and SQL queries executed in `odoo-bin shell`.

Lifecycle
---------
When the shell starts, ``install_patches()`` monkey-patches ``Cursor.commit``
and ``Cursor.rollback``, and ``_activate()`` initialises the thread-local
state that marks the current thread as being in shell-audit mode:

    _audit.commands   - complete Python transcript for this session;
                        every cell / REPL line is appended, never cleared.
    _audit.sql        - SQL accumulated since the last commit / rollback;
                        reset to [] on every commit or rollback.
    _audit.history_id - ID of the single ``shell.audit.history`` record for
                        this session; set on the first commit, never cleared.

On ``cr.commit()``:
  - ``_audit.sql`` is snapshotted and reset to ``[]``,
  - ``_audit.history_id`` and the live ``_audit.commands`` list are captured
    by the ``postcommit`` closure,
  - ``_persist`` creates the history record on the first commit (and updates
    its ``source`` field on every subsequent commit to reflect the growing
    transcript), then always creates a ``shell.audit.transaction`` record.
  - All writes are done on the *same* cursor (fresh transaction after the
    user's commit) via ``cr._cnx.commit()`` to avoid opening a second
    connection from the pool and to avoid recursing through the patched
    ``Cursor.commit``.

On ``cr.rollback()``:
  - only ``_audit.sql`` is cleared; the command transcript and the session
    history ID are preserved so the next commit picks up where it left off.

SQL tracking is temporarily suspended while ``_persist`` writes its own
records, so internal audit SQL never appears in user-facing history.

The module keeps ORM imports lazy so it can be loaded before the registry
is ready.
"""
import logging
import threading

_logger = logging.getLogger(__name__)

_patches_installed = False

# Thread-local storage.
# .commands    list[str] | None  - None means "not in shell mode"
# .sql         list[str] | None  - None means "temporarily suspended"
# .history_id  int | None        - session history record; set on first commit
_audit = threading.local()


# ---------------------------------------------------------------------------
# Patch installation
# ---------------------------------------------------------------------------

def install_patches():
    """Monkey-patch ``Cursor.commit`` and ``Cursor.rollback`` (idempotent)."""
    global _patches_installed
    if _patches_installed:
        return

    from .. import sql_db  # noqa: PLC0415

    _orig_commit = sql_db.Cursor.commit
    _orig_rollback = sql_db.Cursor.rollback

    def _commit(self):
        commands = _audit.commands if hasattr(_audit, 'commands') else None
        if commands is not None:
            # Snapshot and reset the SQL accumulator *before* the actual
            # commit so each transaction record captures only its own SQL.
            # commands is passed by reference so _persist always sees the
            # up-to-date transcript at the time it runs.
            snapshot_sql = list(_audit.sql or []) if hasattr(_audit, 'sql') else []
            _audit.sql = []

            # Only persist when there is actual SQL to record; skip empty
            # commits (e.g. explicit cr.commit() with no pending changes).
            if snapshot_sql:
                history_id = _audit.history_id if hasattr(_audit, 'history_id') else None
                # Capture the transaction timestamp before _orig_commit resets cr._now.
                transaction_date = self.now()

                @self.postcommit.add
                def _save():
                    _persist(self, history_id, commands, snapshot_sql, transaction_date)

        _orig_commit(self)

    def _rollback(self):
        if hasattr(_audit, 'commands') and _audit.commands is not None:
            # Discard uncommitted SQL only; the transcript and history ID
            # are preserved so the session can continue after a rollback.
            _audit.sql = []
        _orig_rollback(self)

    sql_db.Cursor.commit = _commit
    sql_db.Cursor.rollback = _rollback
    _patches_installed = True


# ---------------------------------------------------------------------------
# Shell-mode activation
# ---------------------------------------------------------------------------

def _activate():
    """Initialise thread-local state for a new shell session."""
    _audit.commands = []
    _audit.sql = []
    _audit.history_id = None


# ---------------------------------------------------------------------------
# SQL query hook
# ---------------------------------------------------------------------------

def _install_query_hook():
    """Attach ``_record_sql`` to the current thread's ``query_hooks`` list."""
    thread = threading.current_thread()
    if not hasattr(thread, 'query_hooks'):
        thread.query_hooks = []
    if _record_sql not in thread.query_hooks:
        thread.query_hooks.append(_record_sql)


def _record_sql(cr, query, params, start, delay):
    """Accumulate SQL queries while shell-audit mode is active."""
    sql = _audit.sql if hasattr(_audit, 'sql') else None
    if sql is not None:
        sql.append(str(query))


# ---------------------------------------------------------------------------
# Command accumulation
# ---------------------------------------------------------------------------

def append_command(source):
    """Append *source* to the session's command transcript.

    Called once per complete Python command (IPython cell or REPL line).
    Does nothing when not in shell-audit mode.
    """
    commands = _audit.commands if hasattr(_audit, 'commands') else None
    if commands is not None:
        commands.append(source)


# ---------------------------------------------------------------------------
# IPython integration
# ---------------------------------------------------------------------------

def setup_ipython(ip):
    """Register the ``pre_run_cell`` hook on *ip*.

    Must be called from within the IPython session (e.g. via ``exec_lines``).
    """
    ip.events.register('pre_run_cell', lambda info: append_command(info.raw_cell))


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def _persist(cr, history_id, commands, sql_queries, transaction_date):
    """Write audit records on *cr* and commit them (called inside postcommit).

    Reuses the same cursor (which is in a fresh transaction after the user's
    commit) and commits via ``cr._cnx.commit()`` to avoid touching the
    connection pool and to avoid recursing through the patched
    ``Cursor.commit``.

    SQL tracking is suspended for the duration so internal writes are not
    recorded in the user-facing history.

    No-op when the ``shell.audit.history`` model is not installed.
    """
    from .. import api  # noqa: PLC0415

    # Suspend SQL tracking so our own INSERT/UPDATE statements are not recorded.
    prev_sql = _audit.sql if hasattr(_audit, 'sql') else None
    _audit.sql = None
    try:
        env = api.Environment(cr, api.SUPERUSER_ID, {})
        if 'shell.audit.history' not in env:
            return

        source = '\n'.join(commands)
        if history_id is None:
            history = env['shell.audit.history'].sudo().create({'source': source})
            _audit.history_id = history.id
            history_id = history.id
        else:
            env['shell.audit.history'].sudo().browse(history_id).write({'source': source})

        env['shell.audit.transaction'].sudo().create({
            'history_id': history_id,
            'transaction_date': transaction_date,
            'queries': '\n'.join(sql_queries),
        })

        # Flush ORM writes, then commit directly to bypass the patched method.
        cr.flush()
        cr._cnx.commit()
        if cr.transaction is not None:
            cr.transaction.clear()
        cr._now = None
        cr.prerollback.clear()
        cr.postrollback.clear()
    except Exception:
        try:
            cr._cnx.rollback()
            if cr.transaction is not None:
                cr.transaction.clear()
            cr._now = None
        except Exception:
            pass
        _logger.exception("Failed to persist shell audit record")
    finally:
        _audit.sql = prev_sql
