# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.


"""
The PostgreSQL connector is a connectivity layer between the OpenERP code and
the database, *not* a database abstraction toolkit. Database abstraction is what
the ORM does, in fact.
"""

from contextlib import contextmanager
from datetime import timedelta, datetime
import itertools
import logging
import os
import time
import threading
import uuid
import warnings

from inspect import currentframe
import psycopg2
import psycopg2.extras
import psycopg2.extensions
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT, ISOLATION_LEVEL_READ_COMMITTED, ISOLATION_LEVEL_REPEATABLE_READ
from psycopg2.pool import PoolError
from psycopg2.sql import SQL, Identifier
from werkzeug import urls

from .tools.func import frame_codeinfo, locked

psycopg2.extensions.register_type(psycopg2.extensions.UNICODE)

_logger = logging.getLogger(__name__)
_logger_conn = _logger.getChild("connection")

real_time = time.time.__call__  # ensure we have a non patched time for query times when using freezegun

def unbuffer(symb, cr):
    if symb is None:
        return None
    return str(symb)

def undecimalize(symb, cr):
    if symb is None:
        return None
    return float(symb)

psycopg2.extensions.register_type(psycopg2.extensions.new_type((700, 701, 1700,), 'float', undecimalize))


from . import tools

from .tools import parse_version as pv
if pv(psycopg2.__version__) < pv('2.7'):
    from psycopg2._psycopg import QuotedString
    def adapt_string(adapted):
        """Python implementation of psycopg/psycopg2#459 from v2.7"""
        if '\x00' in adapted:
            raise ValueError("A string literal cannot contain NUL (0x00) characters.")
        return QuotedString(adapted)

    psycopg2.extensions.register_adapter(str, adapt_string)



def flush_env(cr, *, clear=True):
    warnings.warn("Since Odoo 15.0, use cr.flush() instead of flush_env(cr).",
                  DeprecationWarning, stacklevel=2)
    cr.flush()
    if clear:
        cr.clear()


def clear_env(cr):
    warnings.warn("Since Odoo 15.0, use cr.clear() instead of clear_env(cr).",
                  DeprecationWarning, stacklevel=2)
    cr.clear()


import re
re_from = re.compile('.* from "?([a-zA-Z_0-9]+)"? .*$')
re_into = re.compile('.* into "?([a-zA-Z_0-9]+)"? .*$')

sql_counter = 0


class Savepoint:
    """ Reifies an active breakpoint, allows :meth:`BaseCursor.savepoint` users
    to internally rollback the savepoint (as many times as they want) without
    having to implement their own savepointing, or triggering exceptions.

    Should normally be created using :meth:`BaseCursor.savepoint` rather than
    directly.

    The savepoint will be rolled back on unsuccessful context exits
    (exceptions). It will be released ("committed") on successful context exit.
    The savepoint object can be wrapped in ``contextlib.closing`` to
    unconditionally roll it back.

    The savepoint can also safely be explicitly closed during context body. This
    will rollback by default.

    :param BaseCursor cr: the cursor to execute the `SAVEPOINT` queries on
    """
    def __init__(self, cr):
        self.name = str(uuid.uuid1())
        self._name = Identifier(self.name)
        self._cr = cr
        self.closed = False
        cr.execute(SQL('SAVEPOINT {}').format(self._name))

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close(rollback=exc_type is not None)

    def close(self, *, rollback=True):
        if not self.closed:
            self._close(rollback)

    def rollback(self):
        self._cr.execute(SQL('ROLLBACK TO SAVEPOINT {}').format(self._name))

    def _close(self, rollback):
        if rollback:
            self.rollback()
        self._cr.execute(SQL('RELEASE SAVEPOINT {}').format(self._name))
        self.closed = True

class _FlushingSavepoint(Savepoint):
    def __init__(self, cr):
        cr.flush()
        super().__init__(cr)

    def rollback(self):
        self._cr.clear()
        super().rollback()

    def _close(self, rollback):
        if not rollback:
            self._cr.flush()
        super()._close(rollback)

class BaseCursor:
    """ Base class for cursors that manage pre/post commit hooks. """

    def __init__(self):
        self.precommit = tools.Callbacks()
        self.postcommit = tools.Callbacks()
        self.prerollback = tools.Callbacks()
        self.postrollback = tools.Callbacks()
        # By default a cursor has no transaction object.  A transaction object
        # for managing environments is instantiated by registry.cursor().  It
        # is not done here in order to avoid cyclic module dependencies.
        self.transaction = None

    def flush(self):
        """ Flush the current transaction, and run precommit hooks. """
        if self.transaction is not None:
            self.transaction.flush()
        self.precommit.run()

    def clear(self):
        """ Clear the current transaction, and clear precommit hooks. """
        if self.transaction is not None:
            self.transaction.clear()
        self.precommit.clear()

    def reset(self):
        """ Reset the current transaction (this invalidates more that clear()).
            This method should be called only right after commit() or rollback().
        """
        if self.transaction is not None:
            self.transaction.reset()

    def savepoint(self, flush=True) -> Savepoint:
        """context manager entering in a new savepoint

        With ``flush`` (the default), will automatically run (or clear) the
        relevant hooks.
        """
        if flush:
            return _FlushingSavepoint(self)
        else:
            return Savepoint(self)

    def __enter__(self):
        """ Using the cursor as a contextmanager automatically commits and
            closes it::

                with cr:
                    cr.execute(...)

                # cr is committed if no failure occurred
                # cr is closed in any case
        """
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        try:
            if exc_type is None:
                self.commit()
        finally:
            self.close()


class Cursor(BaseCursor):
    """Represents an open transaction to the PostgreSQL DB backend,
       acting as a lightweight wrapper around psycopg2's
       ``cursor`` objects.

        ``Cursor`` is the object behind the ``cr`` variable used all
        over the OpenERP code.

        .. rubric:: Transaction Isolation

        One very important property of database transactions is the
        level of isolation between concurrent transactions.
        The SQL standard defines four levels of transaction isolation,
        ranging from the most strict *Serializable* level, to the least
        strict *Read Uncommitted* level. These levels are defined in
        terms of the phenomena that must not occur between concurrent
        transactions, such as *dirty read*, etc.
        In the context of a generic business data management software
        such as OpenERP, we need the best guarantees that no data
        corruption can ever be cause by simply running multiple
        transactions in parallel. Therefore, the preferred level would
        be the *serializable* level, which ensures that a set of
        transactions is guaranteed to produce the same effect as
        running them one at a time in some order.

        However, most database management systems implement a limited
        serializable isolation in the form of
        `snapshot isolation <http://en.wikipedia.org/wiki/Snapshot_isolation>`_,
        providing most of the same advantages as True Serializability,
        with a fraction of the performance cost.
        With PostgreSQL up to version 9.0, this snapshot isolation was
        the implementation of both the ``REPEATABLE READ`` and
        ``SERIALIZABLE`` levels of the SQL standard.
        As of PostgreSQL 9.1, the previous snapshot isolation implementation
        was kept for ``REPEATABLE READ``, while a new ``SERIALIZABLE``
        level was introduced, providing some additional heuristics to
        detect a concurrent update by parallel transactions, and forcing
        one of them to rollback.

        OpenERP implements its own level of locking protection
        for transactions that are highly likely to provoke concurrent
        updates, such as stock reservations or document sequences updates.
        Therefore we mostly care about the properties of snapshot isolation,
        but we don't really need additional heuristics to trigger transaction
        rollbacks, as we are taking care of triggering instant rollbacks
        ourselves when it matters (and we can save the additional performance
        hit of these heuristics).

        As a result of the above, we have selected ``REPEATABLE READ`` as
        the default transaction isolation level for OpenERP cursors, as
        it will be mapped to the desired ``snapshot isolation`` level for
        all supported PostgreSQL version (8.3 - 9.x).

        Note: up to psycopg2 v.2.4.2, psycopg2 itself remapped the repeatable
        read level to serializable before sending it to the database, so it would
        actually select the new serializable mode on PostgreSQL 9.1. Make
        sure you use psycopg2 v2.4.2 or newer if you use PostgreSQL 9.1 and
        the performance hit is a concern for you.

        .. attribute:: cache

            Cache dictionary with a "request" (-ish) lifecycle, only lives as
            long as the cursor itself does and proactively cleared when the
            cursor is closed.

            This cache should *only* be used to store repeatable reads as it
            ignores rollbacks and savepoints, it should not be used to store
            *any* data which may be modified during the life of the cursor.

    """
    IN_MAX = 1000   # decent limit on size of IN queries - guideline = Oracle limit

    def __init__(self, pool, dbname, dsn, serialized=True):
        super().__init__()

        self.sql_from_log = {}
        self.sql_into_log = {}

        # default log level determined at cursor creation, could be
        # overridden later for debugging purposes
        self.sql_log = _logger.isEnabledFor(logging.DEBUG)

        self.sql_log_count = 0

        # avoid the call of close() (by __del__) if an exception
        # is raised by any of the following initialisations
        self._closed = True

        self.__pool = pool
        self.dbname = dbname
        # Whether to enable snapshot isolation level for this cursor.
        # see also the docstring of Cursor.
        self._serialized = serialized

        self._cnx = pool.borrow(dsn)
        self._obj = self._cnx.cursor()
        if self.sql_log:
            self.__caller = frame_codeinfo(currentframe(), 2)
        else:
            self.__caller = False
        self._closed = False   # real initialisation value
        self.autocommit(False)

        self._default_log_exceptions = True

        self.cache = {}
        self._now = None

    def __build_dict(self, row):
        return {d.name: row[i] for i, d in enumerate(self._obj.description)}
    def dictfetchone(self):
        row = self._obj.fetchone()
        return row and self.__build_dict(row)
    def dictfetchmany(self, size):
        return [self.__build_dict(row) for row in self._obj.fetchmany(size)]
    def dictfetchall(self):
        return [self.__build_dict(row) for row in self._obj.fetchall()]

    def __del__(self):
        if not self._closed and not self._cnx.closed:
            # Oops. 'self' has not been closed explicitly.
            # The cursor will be deleted by the garbage collector,
            # but the database connection is not put back into the connection
            # pool, preventing some operation on the database like dropping it.
            # This can also lead to a server overload.
            msg = "Cursor not closed explicitly\n"
            if self.__caller:
                msg += "Cursor was created at %s:%s" % self.__caller
            else:
                msg += "Please enable sql debugging to trace the caller."
            _logger.warning(msg)
            self._close(True)

    def _format(self, query, params=None):
        encoding = psycopg2.extensions.encodings[self.connection.encoding]
        return self._obj.mogrify(query, params).decode(encoding, 'replace')

    def execute(self, query, params=None, log_exceptions=None):
        global sql_counter
        if params and not isinstance(params, (tuple, list, dict)):
            # psycopg2's TypeError is not clear if you mess up the params
            raise ValueError("SQL query parameters should be a tuple, list or dict; got %r" % (params,))

        if self.sql_log:
            _logger.debug("query: %s", self._format(query, params))
        start = real_time()
        try:
            params = params or None
            res = self._obj.execute(query, params)
        except Exception as e:
            if self._default_log_exceptions if log_exceptions is None else log_exceptions:
                _logger.error("bad query: %s\nERROR: %s", tools.ustr(self._obj.query or query), e)
            raise

        # simple query count is always computed
        self.sql_log_count += 1
        sql_counter += 1

        delay = (real_time() - start)
        current_thread = threading.current_thread()
        if hasattr(current_thread, 'query_count'):
            current_thread.query_count += 1
            current_thread.query_time += delay

        # optional hooks for performance and tracing analysis
        for hook in getattr(current_thread, 'query_hooks', ()):
            hook(self, query, params, start, delay)

        # advanced stats only if sql_log is enabled
        if self.sql_log:
            delay *= 1E6

            query_lower = self._obj.query.decode().lower()
            res_from = re_from.match(query_lower)
            if res_from:
                self.sql_from_log.setdefault(res_from.group(1), [0, 0])
                self.sql_from_log[res_from.group(1)][0] += 1
                self.sql_from_log[res_from.group(1)][1] += delay
            res_into = re_into.match(query_lower)
            if res_into:
                self.sql_into_log.setdefault(res_into.group(1), [0, 0])
                self.sql_into_log[res_into.group(1)][0] += 1
                self.sql_into_log[res_into.group(1)][1] += delay
        return res

    def split_for_in_conditions(self, ids, size=None):
        """Split a list of identifiers into one or more smaller tuples
           safe for IN conditions, after uniquifying them."""
        return tools.misc.split_every(size or self.IN_MAX, ids)

    def print_log(self):
        global sql_counter

        if not self.sql_log:
            return
        def process(type):
            sqllogs = {'from': self.sql_from_log, 'into': self.sql_into_log}
            sum = 0
            if sqllogs[type]:
                sqllogitems = sqllogs[type].items()
                _logger.debug("SQL LOG %s:", type)
                for r in sorted(sqllogitems, key=lambda k: k[1]):
                    delay = timedelta(microseconds=r[1][1])
                    _logger.debug("table: %s: %s/%s", r[0], delay, r[1][0])
                    sum += r[1][1]
                sqllogs[type].clear()
            sum = timedelta(microseconds=sum)
            _logger.debug("SUM %s:%s/%d [%d]", type, sum, self.sql_log_count, sql_counter)
            sqllogs[type].clear()
        process('from')
        process('into')
        self.sql_log_count = 0
        self.sql_log = False

    @contextmanager
    def _enable_logging(self):
        """ Forcefully enables logging for this cursor, restores it afterwards.

        Updates the logger in-place, so not thread-safe.
        """
        previous, self.sql_log = self.sql_log, True
        level = _logger.level
        _logger.setLevel(logging.DEBUG)
        try:
            yield
        finally:
            _logger.setLevel(level)
            self.sql_log = previous

    def close(self):
        if not self._closed:
            return self._close(False)

    def _close(self, leak=False):
        if not self._obj:
            return

        del self.cache

        # advanced stats only if sql_log is enabled
        self.print_log()

        self._obj.close()

        # This force the cursor to be freed, and thus, available again. It is
        # important because otherwise we can overload the server very easily
        # because of a cursor shortage (because cursors are not garbage
        # collected as fast as they should). The problem is probably due in
        # part because browse records keep a reference to the cursor.
        del self._obj

        # Clean the underlying connection, and run rollback hooks.
        self.rollback()

        self._closed = True

        if leak:
            self._cnx.leaked = True
        else:
            chosen_template = tools.config['db_template']
            templates_list = tuple(set(['template0', 'template1', 'postgres', chosen_template]))
            keep_in_pool = self.dbname not in templates_list
            self.__pool.give_back(self._cnx, keep_in_pool=keep_in_pool)

    def autocommit(self, on):
        if on:
            warnings.warn(
                "Since Odoo 13.0, the ORM delays UPDATE queries for "
                "performance reasons. Since then, using the ORM with "
                " autocommit(True) is unsafe, as computed fields may not be "
                "fully computed at commit.", DeprecationWarning, stacklevel=2)
            isolation_level = ISOLATION_LEVEL_AUTOCOMMIT
        else:
            # If a serializable cursor was requested, we
            # use the appropriate PotsgreSQL isolation level
            # that maps to snapshot isolation.
            # For all supported PostgreSQL versions (8.3-9.x),
            # this is currently the ISOLATION_REPEATABLE_READ.
            # See also the docstring of this class.
            # NOTE: up to psycopg 2.4.2, repeatable read
            #       is remapped to serializable before being
            #       sent to the database, so it is in fact
            #       unavailable for use with pg 9.1.
            isolation_level = \
                ISOLATION_LEVEL_REPEATABLE_READ \
                if self._serialized \
                else ISOLATION_LEVEL_READ_COMMITTED
        self._cnx.set_isolation_level(isolation_level)

    def after(self, event, func):
        """ Register an event handler.

            :param event: the event, either `'commit'` or `'rollback'`
            :param func: a callable object, called with no argument after the
                event occurs

            Be careful when coding an event handler, since any operation on the
            cursor that was just committed/rolled back will take place in the
            next transaction that has already begun, and may still be rolled
            back or committed independently. You may consider the use of a
            dedicated temporary cursor to do some database operation.
        """
        warnings.warn(
            "Cursor.after() is deprecated, use Cursor.postcommit.add() instead.",
            DeprecationWarning,
        )
        if event == 'commit':
            self.postcommit.add(func)
        elif event == 'rollback':
            self.postrollback.add(func)

    def commit(self):
        """ Perform an SQL `COMMIT` """
        self.flush()
        result = self._cnx.commit()
        self.clear()
        self._now = None
        self.prerollback.clear()
        self.postrollback.clear()
        self.postcommit.run()
        return result

    def rollback(self):
        """ Perform an SQL `ROLLBACK` """
        self.clear()
        self.postcommit.clear()
        self.prerollback.run()
        result = self._cnx.rollback()
        self._now = None
        self.postrollback.run()
        return result

    def __getattr__(self, name):
        return getattr(self._obj, name)

    @property
    def closed(self):
        return self._closed

    def now(self):
        """ Return the transaction's timestamp ``NOW() AT TIME ZONE 'UTC'``. """
        if self._now is None:
            self.execute("SELECT (now() AT TIME ZONE 'UTC')")
            self._now = self.fetchone()[0]
        return self._now


class TestCursor(BaseCursor):
    """ A pseudo-cursor to be used for tests, on top of a real cursor. It keeps
        the transaction open across requests, and simulates committing, rolling
        back, and closing:

        +------------------------+---------------------------------------------------+
        |  test cursor           | queries on actual cursor                          |
        +========================+===================================================+
        |``cr = TestCursor(...)``| SAVEPOINT test_cursor_N                           |
        +------------------------+---------------------------------------------------+
        | ``cr.execute(query)``  | query                                             |
        +------------------------+---------------------------------------------------+
        |  ``cr.commit()``       | RELEASE SAVEPOINT test_cursor_N                   |
        |                        | SAVEPOINT test_cursor_N (lazy)                    |
        +------------------------+---------------------------------------------------+
        |  ``cr.rollback()``     | ROLLBACK TO SAVEPOINT test_cursor_N (if savepoint)|
        +------------------------+---------------------------------------------------+
        |  ``cr.close()``        | ROLLBACK TO SAVEPOINT test_cursor_N (if savepoint)|
        |                        | RELEASE SAVEPOINT test_cursor_N (if savepoint)    |
        +------------------------+---------------------------------------------------+
    """
    _cursors_stack = []
    def __init__(self, cursor, lock):
        super().__init__()
        self._now = None
        self._closed = False
        self._cursor = cursor
        # we use a lock to serialize concurrent requests
        self._lock = lock
        self._lock.acquire()
        self._cursors_stack.append(self)
        # in order to simulate commit and rollback, the cursor maintains a
        # savepoint at its last commit, the savepoint is created lazily
        self._savepoint = self._cursor.savepoint(flush=False)

    def execute(self, *args, **kwargs):
        if not self._savepoint:
            self._savepoint = self._cursor.savepoint(flush=False)

        return self._cursor.execute(*args, **kwargs)

    def close(self):
        if not self._closed:
            self.rollback()
            self._closed = True
            if self._savepoint:
                self._savepoint.close(rollback=False)

            tos = self._cursors_stack.pop()
            if tos is not self:
                _logger.warning("Found different un-closed cursor when trying to close %s: %s", self, tos)

            self._lock.release()

    def autocommit(self, on):
        _logger.debug("TestCursor.autocommit(%r) does nothing", on)

    def commit(self):
        """ Perform an SQL `COMMIT` """
        self.flush()
        if self._savepoint:
            self._savepoint.close(rollback=False)
            self._savepoint = None
        self.clear()
        self.prerollback.clear()
        self.postrollback.clear()
        self.postcommit.clear()         # TestCursor ignores post-commit hooks

    def rollback(self):
        """ Perform an SQL `ROLLBACK` """
        self.clear()
        self.postcommit.clear()
        self.prerollback.run()
        if self._savepoint:
            self._savepoint.rollback()
        self.postrollback.run()

    def __getattr__(self, name):
        return getattr(self._cursor, name)

    def now(self):
        """ Return the transaction's timestamp ``datetime.now()``. """
        if self._now is None:
            self._now = datetime.now()
        return self._now


class PsycoConnection(psycopg2.extensions.connection):
    def lobject(*args, **kwargs):
        pass


class ConnectionPool(object):
    """ The pool of connections to database(s)

        Keep a set of connections to pg databases open, and reuse them
        to open cursors for all transactions.

        The connections are *not* automatically closed. Only a close_db()
        can trigger that.
    """
    def __init__(self, maxconn=64):
        self._connections = []
        self._maxconn = max(maxconn, 1)
        self._lock = threading.Lock()

    def __repr__(self):
        used = len([1 for c, u in self._connections[:] if u])
        count = len(self._connections)
        return "ConnectionPool(used=%d/count=%d/max=%d)" % (used, count, self._maxconn)

    def _debug(self, msg, *args):
        _logger_conn.debug(('%r ' + msg), self, *args)

    @locked
    def borrow(self, connection_info):
        """
        :param dict connection_info: dict of psql connection keywords
        :rtype: PsycoConnection
        """
        # free dead and leaked connections
        for i, (cnx, _) in tools.reverse_enumerate(self._connections):
            if cnx.closed:
                self._connections.pop(i)
                self._debug('Removing closed connection at index %d: %r', i, cnx.dsn)
                continue
            if getattr(cnx, 'leaked', False):
                delattr(cnx, 'leaked')
                self._connections.pop(i)
                self._connections.append((cnx, False))
                _logger.info('%r: Free leaked connection to %r', self, cnx.dsn)

        for i, (cnx, used) in enumerate(self._connections):
            if not used and cnx._original_dsn == connection_info:
                try:
                    cnx.reset()
                except psycopg2.OperationalError:
                    self._debug('Cannot reset connection at index %d: %r', i, cnx.dsn)
                    # psycopg2 2.4.4 and earlier do not allow closing a closed connection
                    if not cnx.closed:
                        cnx.close()
                    continue
                self._connections.pop(i)
                self._connections.append((cnx, True))
                self._debug('Borrow existing connection to %r at index %d', cnx.dsn, i)

                return cnx

        if len(self._connections) >= self._maxconn:
            # try to remove the oldest connection not used
            for i, (cnx, used) in enumerate(self._connections):
                if not used:
                    self._connections.pop(i)
                    if not cnx.closed:
                        cnx.close()
                    self._debug('Removing old connection at index %d: %r', i, cnx.dsn)
                    break
            else:
                # note: this code is called only if the for loop has completed (no break)
                raise PoolError('The Connection Pool Is Full')

        try:
            result = psycopg2.connect(
                connection_factory=PsycoConnection,
                **connection_info)
        except psycopg2.Error:
            _logger.info('Connection to the database failed')
            raise
        result._original_dsn = connection_info
        self._connections.append((result, True))
        self._debug('Create new connection backend PID %d', result.get_backend_pid())
        return result

    @locked
    def give_back(self, connection, keep_in_pool=True):
        self._debug('Give back connection to %r', connection.dsn)
        for i, (cnx, used) in enumerate(self._connections):
            if cnx is connection:
                self._connections.pop(i)
                if keep_in_pool:
                    self._connections.append((cnx, False))
                    self._debug('Put connection to %r in pool', cnx.dsn)
                else:
                    self._debug('Forgot connection to %r', cnx.dsn)
                    cnx.close()
                break
        else:
            raise PoolError('This connection does not belong to the pool')

    @locked
    def close_all(self, dsn=None):
        count = 0
        last = None
        for i, (cnx, used) in tools.reverse_enumerate(self._connections):
            if dsn is None or cnx._original_dsn == dsn:
                cnx.close()
                last = self._connections.pop(i)[0]
                count += 1
        _logger.info('%r: Closed %d connections %s', self, count,
                    (dsn and last and 'to %r' % last.dsn) or '')


class Connection(object):
    """ A lightweight instance of a connection to postgres
    """
    def __init__(self, pool, dbname, dsn):
        self.dbname = dbname
        self.dsn = dsn
        self.__pool = pool

    def cursor(self, serialized=True):
        cursor_type = serialized and 'serialized ' or ''
        _logger.debug('create %scursor to %r', cursor_type, self.dsn)
        return Cursor(self.__pool, self.dbname, self.dsn, serialized=serialized)

    # serialized_cursor is deprecated - cursors are serialized by default
    serialized_cursor = cursor

    def __bool__(self):
        raise NotImplementedError()
    __nonzero__ = __bool__

def connection_info_for(db_or_uri):
    """ parse the given `db_or_uri` and return a 2-tuple (dbname, connection_params)

    Connection params are either a dictionary with a single key ``dsn``
    containing a connection URI, or a dictionary containing connection
    parameter keywords which psycopg2 can build a key/value connection string
    (dsn) from

    :param str db_or_uri: database name or postgres dsn
    :rtype: (str, dict)
    """
    app_name = "odoo-%d" % os.getpid()
    if db_or_uri.startswith(('postgresql://', 'postgres://')):
        # extract db from uri
        us = urls.url_parse(db_or_uri)
        if len(us.path) > 1:
            db_name = us.path[1:]
        elif us.username:
            db_name = us.username
        else:
            db_name = us.hostname
        return db_name, {'dsn': db_or_uri, 'application_name': app_name}

    connection_info = {'database': db_or_uri, 'application_name': app_name}
    for p in ('host', 'port', 'user', 'password', 'sslmode'):
        cfg = tools.config['db_' + p]
        if cfg:
            connection_info[p] = cfg

    return db_or_uri, connection_info

_Pool = None

def db_connect(to, allow_uri=False):
    global _Pool
    if _Pool is None:
        _Pool = ConnectionPool(int(tools.config['db_maxconn']))

    db, info = connection_info_for(to)
    if not allow_uri and db != to:
        raise ValueError('URI connections not allowed')
    return Connection(_Pool, db, info)

def close_db(db_name):
    """ You might want to call odoo.modules.registry.Registry.delete(db_name) along this function."""
    global _Pool
    if _Pool:
        _Pool.close_all(connection_info_for(db_name)[1])

def close_all():
    global _Pool
    if _Pool:
        _Pool.close_all()
