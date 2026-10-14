"""
The module :mod:`odoo.tests.common` provides unittest test cases and a few
helpers and classes to write tests.

"""
from __future__ import annotations

import base64
import binascii
import concurrent.futures
import contextlib
import contextvars
import difflib
import importlib
import inspect
import itertools
import json
import logging
import os
import pathlib
import platform
import pprint
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import typing
import unittest
from collections import defaultdict, deque
from concurrent.futures import CancelledError, Future, InvalidStateError, wait
from contextlib import AbstractContextManager, ExitStack, contextmanager
from copy import deepcopy
from datetime import datetime
from functools import cache, partial, wraps
from itertools import islice, zip_longest
from textwrap import shorten
from unittest.mock import Mock, _patch, patch
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from uuid import uuid4
from xmlrpc import client as xmlrpclib

import freezegun
import psutil
import requests
from lxml import etree, html
from passlib.context import CryptContext
from requests import PreparedRequest, Session
from urllib3.util import parse_url
from werkzeug.exceptions import BadRequest

import odoo.cli
import odoo.models
import odoo.orm.registry
from odoo import api, fields
from odoo.exceptions import AccessError
from odoo.fields import Command
from odoo.http import request, request_var
from odoo.http.requestlib import Request
from odoo.http.session import (
    DEFAULT_LANG,
    get_default_session,
    logout,
    update_session_token,
    session_store,
)
from odoo.http.session import Session as OdooHttpSession
from odoo.orm.environments import CacheLayer
from odoo.orm.model_classes import is_model_definition
from odoo.modules.registry import Registry
from odoo.sql_db import Cursor
from odoo.tools import SQL, DotDict, config, file_open, float_compare, mute_logger, profiler
from odoo.tools.binary import BinaryBytes
from odoo.tools.lru import LRU
from odoo.tools.mail import single_email_re
from odoo.tools.misc import diff_zip, find_in_path, real_time, str2bool
from odoo.tools.safe_eval import safe_whitelist
from odoo.tools.xml_utils import _validate_xml

import odoo.addons.base
from . import case, test_cursor

if typing.TYPE_CHECKING:
    from collections.abc import Iterable

try:
    import websocket
except ImportError:
    # chrome headless tests will be skipped
    websocket = None

_logger = logging.getLogger(__name__)
if odoo.cli.COMMAND in ('server', 'start') and not config['test_enable']:
    _logger.error(
        "Importing test framework"
        ", avoid importing from business modules and when not running in test mode",
        stack_info=True,
    )
else:
    _logger.info("Importing test framework", stack_info=_logger.isEnabledFor(logging.DEBUG))


# The odoo library is supposed already configured.
HOST = '127.0.0.1'
# Useless constant, tests are aware of the content of demo data
ADMIN_USER_ID = api.SUPERUSER_ID

CHECK_BROWSER_SLEEP = 0.1 # seconds
CHECK_BROWSER_ITERATIONS = 100
BROWSER_WAIT = CHECK_BROWSER_SLEEP * CHECK_BROWSER_ITERATIONS # seconds
DEFAULT_SUCCESS_SIGNAL = 'test successful'
TEST_CURSOR_COOKIE_NAME = 'test_request_key'

DISABLE_TIMEOUTS = str2bool(os.getenv('ODOO_TEST_DISABLE_TIMEOUT', '0'))

_allowed_create_models = contextvars.ContextVar('allowed_create_models', default=frozenset())

IGNORED_MSGS = re.compile(r"""
    failed\ to\ fetch  # base error
  | connectionlosterror:  # conversion by offlineFailToFetchErrorHandler
  | assetsloadingerror: # lazy loaded bundle
""", flags=re.VERBOSE | re.IGNORECASE).search

def get_db_name():
    dbnames = odoo.tools.config['db_name']
    # If the database name is not provided on the command-line,
    # use the one on the thread (which means if it is provided on
    # the command-line, this will break when installing another
    # database from XML-RPC).
    if not dbnames and hasattr(threading.current_thread(), 'dbname'):
        return threading.current_thread().dbname
    if len(dbnames) > 1:
        sys.exit("-d/--database/db_name has multiple database, please provide a single one")
    return dbnames[0]


standalone_tests = defaultdict(list)


class RegistryRLock(threading._RLock):
    @property
    def count(self):
        return self._count  # Expose private attribute


# The lock should only be released when new test cursors are meant to be opened.
# Further filtering on cursors can be done by extending `assertCanOpenTestCursor`.
_registry_test_lock = RegistryRLock()
_registry_test_lock.acquire()
_disable_flushing_cursor = False


@contextmanager
def release_test_lock(check_acquired=False):
    """ Releases the test lock in a context manager, the lock is acquired once the context is over."""
    if check_acquired and not _registry_test_lock.count:
        # not acquired, just noop
        yield
        return
    try:
        _registry_test_lock.release()
        yield
    finally:
        if not _registry_test_lock.acquire(timeout=60):
            tag = odoo.modules.module.current_test.canonical_tag
            exit(f'Could not re-acquire the registry lock during {tag}, exiting...')


@contextmanager
def flushing_cursor(cr: Cursor):
    """ Simulate a commit on a cursor (without comitting) and reset on exit.

    Run this on the main cursor when creating test cursors so that they can see
    changes made on the main cursor. You can still continue using the main
    cursor inside the block, it will be flushed on exit and then reset.
    """
    assert isinstance(odoo.modules.module.current_test, TransactionCase), "only available for TransactionCase"

    if _disable_flushing_cursor:
        # execution of wkhtml happens in parallel, we don't want to flush the
        # cursor in that case
        yield
        return

    if cr.transaction is None:  # no environment to clear
        cr.flush()
        yield
        return

    # simluate cr.commit()
    state_stack = cr.transaction._state_stack__
    registry_invalidated = cr.transaction._registry_invalidated
    closing = cr._closing
    # preserve registry_invalidated flag which is reset when committing
    # sum them after yielding
    try:
        # Since we simulate an empty stack, make sure the parent layer is set as
        # the cache on the registry. This ensures that existing caches are not
        # affected by updating parent layers.
        registry_caches = cr.transaction.registry.registry_caches__
        for name in registry_caches:
            layer = cr.transaction.ormcaches__[name]
            parent = layer.parent
            if parent is None:
                # simulate signaling already here
                layer.parent = parent = LRU(999999)
                layer.update_parent()
            registry_caches[name] = (registry_caches[name][0], parent)

        cr._closing = True  # do a quick clean
        cr.transaction._state_stack__ = []  # replace the stack
        with cr.transaction.committing():
            pass  # no real commit
        # restore the stack
        cr.transaction._state_stack__ = state_stack
        cr._closing = closing

        try:
            yield
        finally:
            # the registry may be invalidated during the yield
            registry_invalidated += cr.transaction._registry_invalidated

        # simulate cr.commit() again to flush changes made by the main cursor
        state_stack = cr.transaction._state_stack__
        closing = cr._closing

        cr._closing = False  # do a reset
        cr.transaction._state_stack__ = []  # replace the stack
        with cr.transaction.committing():
            pass  # no real commit
    finally:
        cr.transaction._state_stack__ = state_stack
        cr._closing = closing
        cr.transaction._registry_invalidated = registry_invalidated


def standalone(*tags):
    """ Decorator for standalone test functions.  This is somewhat dedicated to
    tests that install, upgrade or uninstall some modules, which is currently
    forbidden in regular test cases.  The function is registered under the given
    ``tags`` and the corresponding Odoo module name.
    """
    def register(func):
        # register func by odoo module name
        if func.__module__.startswith('odoo.addons.'):
            module = func.__module__.split('.')[2]
            standalone_tests[module].append(func)
        # register func with aribitrary name, if any
        for tag in tags:
            standalone_tests[tag].append(func)
        standalone_tests['all'].append(func)
        return func

    return register


def test_xsd(url=None, path=None, skip=False):
    def decorator(func):
        def wrapped_f(self, *args, **kwargs):
            if not skip:
                xmls = func(self, *args, **kwargs)
                _validate_xml(self.env, url, path, xmls)
        return wrapped_f
    return decorator


def new_test_user(env, login='', groups='base.group_user', context=None, **kwargs):
    """ Helper function to create a new test user. It allows to quickly create
    users given its login and groups (being a comma separated list of xml ids).
    Kwargs are directly propagated to the create to further customize the
    created user.

    User creation uses a potentially customized environment using the context
    parameter allowing to specify a custom context. It can be used to force a
    specific behavior and/or simplify record creation. An example is to use
    mail-related context keys in mail tests to speedup record creation.

    Some specific fields are automatically filled to avoid issues

     * group_ids: it is filled using groups function parameter;
     * name: "login (groups)" by default as it is required;
     * email: it is either the login (if it is a valid email) or a generated
       string 'x.x@example.com' (x being the first login letter). This is due
       to email being required for most odoo operations;
    """
    if not login:
        raise ValueError('New users require at least a login')
    if not groups:
        raise ValueError('New users require at least user groups')
    if context is None:
        context = {}

    group_ids = [Command.set(kwargs.pop('group_ids', False) or [env.ref(g.strip()).id for g in groups.split(',')])]
    create_values = dict(kwargs, login=login, group_ids=group_ids)
    # automatically generate a name as "Login (groups)" to ease user comprehension
    if not create_values.get('name'):
        create_values['name'] = '%s (%s)' % (login, groups)
    # automatically give a password equal to login
    if not create_values.get('password'):
        create_values['password'] = login + 'x' * (8 - len(login))
    # generate email if not given as most test require an email
    if 'email' not in create_values:
        if single_email_re.match(login):
            create_values['email'] = login
        else:
            create_values['email'] = '%s.%s@example.com' % (login[0], login[0])
    # ensure company_id + allowed company constraint works if not given at create
    if 'company_id' in create_values and 'company_ids' not in create_values:
        create_values['company_ids'] = [(4, create_values['company_id'])]

    return env['res.users'].sudo().with_context(**context).create(create_values)

def loaded_demo_data(env):
    return bool(env.ref('base.user_demo', raise_if_not_found=False))

class RecordCapturer:
    def __init__(self, model, domain=None):
        self._model = model
        self._domain = domain or []

    def __enter__(self):
        self._before = self._model.search(self._domain, order='id')
        self._after = None
        return self

    def __exit__(self, exc_type, exc_value, exc_traceback):
        if exc_type is None:
            self._after = self._model.search(self._domain, order='id') - self._before

    @property
    def records(self):
        if self._after is None:
            return self._model.search(self._domain, order='id') - self._before
        return self._after


def _enter_context(cm, addcleanup):
    # We look up the special methods on the type to match the with
    # statement.
    cls = type(cm)
    try:
        enter = cls.__enter__
        exit = cls.__exit__
    except AttributeError:
        raise TypeError(f"'{cls.__module__}.{cls.__qualname__}' object does "
                        f"not support the context manager protocol") from None
    result = enter(cm)
    addcleanup(exit, cm, None, None, None)
    return result


def _normalize_arch_for_assert(arch_string, parser_method="xml"):
    """Takes some xml and normalize it to make it comparable to other xml
    in particular, blank text is removed, and the output is pretty-printed

    :param str arch_string: the string representing an XML arch
    :param str parser_method: an string representing which lxml.Parser class to use
        when normalizing both archs. Takes either "xml" or "html"
    :return: the normalized arch
    :rtype str:
    """
    Parser = None
    if parser_method == 'xml':
        Parser = etree.XMLParser
    elif parser_method == 'html':
        Parser = etree.HTMLParser
    parser = Parser(remove_blank_text=True)
    arch_string = etree.fromstring(arch_string, parser=parser)
    return etree.tostring(arch_string, pretty_print=True, encoding='unicode')


class BlockedRequest(requests.exceptions.ConnectionError):
    pass


_super_send = requests.Session.send


class MockHTTPClient(AbstractContextManager):
    """Mock ``requests`` calls and return a fake ``requests.Response``.

    This context manager patches ``requests.sessions.Session.send``.
    Each outgoing request is checked against the match criteria. If it
    matches, the request is recorded in ``calls``, the optional
    ``side_effect`` is executed, and a mocked response is returned. If
    it does not match, the request is delegated to the previously active
    ``send`` (either the real ``requests`` implementation, or an outer
    ``MockHTTPClient`` when you nest mocks), so multiple
    ``MockHTTPClient`` instances can be composed.

    A request matches when all checks pass:

    * ``method`` (if passed): matches the HTTP method (case-insensitive)
    * ``url`` (if passed):  limits which requests this mock will catch.
      Use ``"https://api.example.com/v1/items"`` to match that
      host + path; include more (e.g. a query string) to make it
      stricter. Anything you omit is treated as "don't care" and won't
      affect matching.
    * ``matcher(request)`` (if passed): a custom function predicate for
      anything beyond method/URL (headers, JSON body, etc.).

    The response is built from ``return_status`` and ``return_headers``
    (both can be values or callables).
    The body comes from ``return_json`` (JSON-encoded and defaults
    ``Content-Type`` to ``application/json``) or from ``return_body``
    when ``return_json`` is ``None``.

    Examples
    --------
    Mock an auth flow and return dynamic JSON based on headers

    .. code-block:: python
        def is_body_authorized(req):
            token = req.headers.get('Authorization')
            if token == 'Bearer super-secure-token':
                return "Authorized!"
            return "Not authorized :("

        def check_auth_header(req):
            self.assertIn(
                'Authorization',
                req.headers,
                "Missing Authorization header",
            )

        with (
            MockHTTPClient(
                url='https://auth.example.com/token',
                return_json={'token': 'super-secure-token'},
            ) as auth_mock,
            MockHTTPClient(
                url='https://api.example.com/am-i-authorized',
                return_body=is_body_authorized,
                side_effect=check_auth_header,
            ) as api_mock,
        ):
            token = requests.get(
                'https://auth.example.com/token',
            ).json()['token']
            auth_mock.assert_called_once()

            resp = requests.get(
                'https://api.example.com/am-i-authorized',
                headers={'Authorization': f'Bearer {token}'},
            )
            api_mock.assert_called_once()
            assert resp.text == "Authorized!"
    """

    def __init__(
        self,
        url: str | None = None,
        *,
        method: str | None = None,
        matcher: typing.Callable[[requests.PreparedRequest], bool] | None = None,
        return_status: int | typing.Callable[[requests.PreparedRequest], int] = 200,
        return_json: dict | typing.Callable[[requests.PreparedRequest], dict] | None = None,
        return_body: bytes | str | typing.Callable[[requests.PreparedRequest], bytes | str] | None = None,
        return_headers: dict | typing.Callable[[requests.PreparedRequest], dict] | None = None,
        side_effect: typing.Callable[[requests.PreparedRequest], None] | None = None,
    ):
        self.url = parse_url(url) if url else None
        if url and not self.url.host:
            raise ValueError(f"URL '{url}' is not valid: missing host")
        self.method = method.upper() if method else None
        self.matcher = matcher
        self.return_status = return_status if callable(return_status) else lambda _req: return_status

        self.return_json = None
        if callable(return_json):
            self.return_json = return_json
        elif return_json is not None:
            self.return_json = lambda _req: return_json
        if self.return_json is not None and return_body is not None:
            raise ValueError("Cannot specify both return_json and return_body")

        self.return_body = return_body if callable(return_body) else lambda _req: return_body
        self.return_headers = return_headers if callable(return_headers) else lambda _req: return_headers or {}
        self.side_effect = side_effect
        self.calls = []
        self.super_send = None

    def _request_matches(self, req: requests.PreparedRequest) -> bool:
        if self.method and self.method != req.method.upper():
            return False
        if self.url and req.url:
            request_url = parse_url(req.url)
            if any((
                self.url.scheme and self.url.scheme != request_url.scheme,
                self.url.host and self.url.host != request_url.host,
                self.url.port and self.url.port != request_url.port,
                self.url.path and self.url.path != request_url.path,
                self.url.query and self.url.query != request_url.query,
            )):
                return False
        return self.matcher is None or self.matcher(req)

    def __enter__(self):
        self.super_send = requests.sessions.Session.send
        self.calls = []

        def send(session, req: requests.PreparedRequest, **kw):
            if not self._request_matches(req):
                return self.super_send(session, req, **kw)

            self.calls.append(req)
            if self.side_effect:
                self.side_effect(req)

            resp = requests.Response()
            resp.status_code = self.return_status(req)
            resp.url = req.url or ''
            resp.request = req
            resp.headers.update(self.return_headers(req))
            if self.return_json is not None:
                resp.headers.setdefault('Content-Type', 'application/json')
                resp.encoding = 'utf-8'
                resp._content = json.dumps(self.return_json(req), ensure_ascii=False).encode()
            else:
                return_body = self.return_body(req)
                resp._content = return_body.encode() if isinstance(return_body, str) else return_body or b''

            return resp

        self.patcher = patch.object(requests.sessions.Session, 'send', send)
        self.patcher.start()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.patcher.stop()
        self.super_send = None
        return False

    def __repr__(self) -> str:
        return (
            'MockHTTPClient('
            f'method={str(self.method)!r}, '
            f'url={str(self.url.url) if self.url is not None else None!r}, '
            f'matcher={"set" if self.matcher else None!r}, '
            f'side_effect={"set" if self.side_effect else None!r}, '
            f'body={"json" if self.return_json is not None else "body"!r}, '
            f'calls={len(self.calls)})'
        )

    def assert_called(self, n_times=None):
        if n_times == 0:
            if self.calls:
                raise AssertionError(f"Expected 0 calls. Called {len(self.calls)} times.")
            return

        if not self.calls:
            raise AssertionError("Expected to have been called at least once. No calls were made.")

        if n_times is not None and len(self.calls) != n_times:
            raise AssertionError(f"Expected {n_times} calls. Called {len(self.calls)} times.")

    def assert_called_once(self):
        self.assert_called(n_times=1)

    def assert_not_called(self):
        self.assert_called(n_times=0)


class DummyRLock:
    """ Dummy reentrant lock, to be used while running rpc and js tests """
    def acquire(self):
        pass

    def release(self):
        pass

    def __enter__(self):
        self.acquire()

    def __exit__(self, *args):
        self.release()


class BaseCase(case.TestCase):
    """ Subclass of TestCase for Odoo-specific code. This class is abstract and
    expects self.registry, self.cr and self.uid to be initialized by subclasses.
    """
    registry: Registry = None
    env: api.Environment = None
    cr: Cursor = None

    longMessage = True      # more verbose error message by default: https://www.odoo.com/r/Vmh
    warm = True             # False during warm-up phase (see :func:`warmup`)
    _python_version = sys.version_info

    _registry_patched = False
    _registry_readonly_enabled = True
    _monitored_create_models = (('res.company', 'stats'),)
    test_cursor_lock_timeout: int = 3600 if DISABLE_TIMEOUTS else 20

    @classmethod
    def __init_subclass__(cls):
        """Assigns default test tags ``standard`` and ``post_install`` to test
        cases not having them. Also sets a completely unnecessary
        ``test_module`` attribute.
        """
        super().__init_subclass__()
        if cls.__module__.startswith('odoo.addons.'):
            if getattr(cls, 'test_tags', None) is None:
                cls.test_tags = {'standard', 'post_install'}
            cls.test_module = cls.__module__.split('.')[2]

    def __init__(self, methodName='runTest'):
        super().__init__(methodName)
        self.addTypeEqualityFunc(etree._Element, self.assertTreesEqual)
        self.addTypeEqualityFunc(html.HtmlElement, self.assertTreesEqual)
        if methodName != 'runTest':
            self.test_tags = self.test_tags | set(self.get_method_additional_tags(getattr(self, methodName)))

    @classmethod
    def _request_handler(cls, s: Session, r: PreparedRequest, /, **kw):
        # allow localhost requests
        # TODO: also check port?
        url = urlsplit(r.url)
        timeout = kw.get('timeout')
        if timeout and timeout < 10:
            _logger.getChild('requests').info('request %s with timeout %s increased to 10s during tests', url, timeout)
            kw['timeout'] = 10
        if url.hostname in (HOST, 'localhost'):
            return _super_send(s, r, **kw)
        if url.scheme == 'file':
            return _super_send(s, r, **kw)

        _logger.getChild('requests').info(
            "Blocking un-mocked external HTTP request %s %s", r.method, r.url)
        raise BlockedRequest(f"External requests verboten (was {r.method} {r.url})")

    @classmethod
    def setUpClass(cls):
        def check_remaining_processes():
            current_process = psutil.Process()
            children = current_process.children(recursive=False)
            for child in children:
                _logger.warning('A child process was found, terminating it: %s', child)
                child.terminate()
            psutil.wait_procs(children, timeout=10)  # mainly to avoid a zombie process that would be logged again at the end.
        cls.addClassCleanup(check_remaining_processes)

        def check_remaining_patchers():
            for patcher in _patch._active_patches:
                _logger.warning("A patcher (targeting %s.%s) was remaining active at the end of %s, disabling it...", patcher.target, patcher.attribute, cls.__name__)
                patcher.stop()
        cls.addClassCleanup(check_remaining_patchers)
        super().setUpClass()
        if 'standard' in cls.test_tags or 'click_all' in cls.test_tags:
            # if the method is passed directly `patch` discards the session
            # object which we need
            # pylint: disable=unnecessary-lambda
            patcher = patch.object(
                requests.sessions.Session,
                'send',
                lambda s, r, **kwargs: cls._request_handler(s, r, **kwargs),
            )
            patcher.start()
            cls.addClassCleanup(patcher.stop)

        # cannot create new registries during testing, it would mess up test
        # runs, install other modules, reporting, etc.
        def forbidden(*a, **kw):
            raise RuntimeError("cannot call Registry.new during testing")
        cls.startClassPatcher(patch.object(Registry, 'new', forbidden))

    def setUp(self):
        super().setUp()
        self.http_request_key: str = ''
        self.http_request_allow_all: bool = False

    def cursor(self):
        return self.registry.cursor()

    @classmethod
    @contextmanager
    def allow_model_create(cls, *model_names: str):
        """Temporarily allow creates on models guarded as expensive in tests."""
        unknown = set(model_names) - {model for model, action in cls._monitored_create_models if action == 'raise'}
        if unknown:
            raise ValueError(f"Models are not guarded against create: {', '.join(sorted(unknown))}")
        token = _allowed_create_models.set(_allowed_create_models.get() | frozenset(model_names))
        try:
            yield
        finally:
            _allowed_create_models.reset(token)

    @property
    def uid(self):
        """ Get the current uid. """
        return self.env.uid

    @uid.setter
    def uid(self, user):
        """ Set the uid by changing the test's environment. """
        self.env = self.env(user=user)
        # set the updated environment as the default one
        self.env.transaction.default_env = self.env

    def ref(self, xid):
        """ Returns database ID for the provided :term:`external identifier`,
        shortcut for ``_xmlid_lookup``

        :param xid: fully-qualified :term:`external identifier`, in the form
                    :samp:`{module}.{identifier}`
        :raise: ValueError if not found
        :returns: registered id
        """
        return self.browse_ref(xid).id

    def browse_ref(self, xid):
        """ Returns a record object for the provided
        :term:`external identifier`

        :param xid: fully-qualified :term:`external identifier`, in the form
                    :samp:`{module}.{identifier}`
        :raise: ValueError if not found
        :returns: :class:`~odoo.models.BaseModel`
        """
        assert "." in xid, "this method requires a fully qualified parameter, in the following form: 'module.identifier'"
        return self.env.ref(xid)

    def patch(self, obj, key, val):
        """ Do the patch ``setattr(obj, key, val)``, and prepare cleanup. """
        patcher = patch.object(obj, key, val)   # this is unittest.mock.patch
        patcher.start()
        self.addCleanup(patcher.stop)

    @classmethod
    def classPatch(cls, obj, key, val):
        """ Do the patch ``setattr(obj, key, val)``, and prepare cleanup. """
        patcher = patch.object(obj, key, val)   # this is unittest.mock.patch
        patcher.start()
        cls.addClassCleanup(patcher.stop)

    def startPatcher(self, patcher):
        mock = patcher.start()
        self.addCleanup(patcher.stop)
        return mock

    @classmethod
    def startClassPatcher(cls, patcher):
        mock = patcher.start()
        cls.addClassCleanup(patcher.stop)
        return mock

    def enterContext(self, cm):
        """Enters the supplied context manager.

        If successful, also adds its __exit__ method as a cleanup
        function and returns the result of the __enter__ method.
        """
        return _enter_context(cm, self.addCleanup)

    @classmethod
    def enterClassContext(cls, cm):
        """Same as enterContext, but class-wide."""
        return _enter_context(cm, cls.addClassCleanup)

    @contextmanager
    def with_user(self, login):
        """ Change user for a given test, like with self.with_user() ... """
        old_uid = self.uid
        old_env = self.env
        try:
            user = self.env['res.users'].sudo().search([('login', '=', login)], order='login')
            assert user, "Login %s not found" % login
            # switch user
            self.uid = user.id
            self.env = self.env(user=self.uid)
            yield
        finally:
            # back
            self.uid = old_uid
            self.env = old_env

    @contextmanager
    def debug_mode(self):
        """ Enable the effects of debug mode (in particular for group ``base.group_no_one``). """
        request = Mock(
            httprequest=Mock(host='localhost'),
            db=self.env.cr.dbname,
            env=self.env,
            session=DotDict(get_default_session(), debug='1', sid=''),
        )
        reset_req = None
        try:
            self.env.flush_all()
            self.env.invalidate_all()
            reset_req = request_var.set(request)
            yield
            self.env.flush_all()
            self.env.invalidate_all()
        finally:
            current_request = request_var.get()
            if reset_req is not None:
                request_var.reset(reset_req)
            if current_request is not request:
                raise Exception('Wrong request stack cleanup.')

    @contextmanager
    def _raisesContext(self, method, expected_exception, *args, **kwargs):
        """ Context manager that clears the environment upon failure. """
        with ExitStack() as init:
            if self.env:
                init.enter_context(self.env.cr.savepoint())
                if isinstance(expected_exception, tuple):
                    clear_cache = any(issubclass(e, AccessError) for e in expected_exception)
                else:
                    clear_cache = issubclass(expected_exception, AccessError)
                if clear_cache:
                    # When checking for an `AccessError`, the cache is cleared
                    # before executing the code. This avoids cache pollution issues and
                    # ensures that access are re-evaluated correctly.
                    self.env.transaction.clear()

            with ExitStack() as inner:
                cm = inner.enter_context(method(expected_exception, *args, **kwargs))
                # *moves* the cleanups from init to inner, this ensures the
                # savepoint gets rolled back when `yield` raises `exception`,
                # but still allows the initialisation to be protected *and* not
                # interfered with by `assertRaises`.
                inner.push(init.pop_all())

                yield cm

    def assertRaises(self, expected_exception, callable=None, *args, **kwargs):
        if callable:
            with self._raisesContext(super().assertRaises, expected_exception):
                callable(*args, **kwargs)
            return None
        return self._raisesContext(super().assertRaises, expected_exception, *args, **kwargs)

    def assertRaisesRegex(self, expected_exception, expected_regex, callable=None, *args, **kwargs):
        if callable:
            with self._raisesContext(super().assertRaisesRegex, expected_exception, expected_regex):
                callable(*args, **kwargs)
            return None
        return self._raisesContext(super().assertRaisesRegex, expected_exception, expected_regex, *args, **kwargs)

    def _patchExecute(self, actual_queries, flush=True):
        Cursor_execute = Cursor.execute

        def execute(self, query, params=None, log_exceptions=None):
            if isinstance(query, SQL):
                assert params is None
                query, params, _ = query._sql_tuple
            actual_queries.append(query)
            return Cursor_execute(self, query, params, log_exceptions)

        if flush:
            self.env.cr.flush()

        with (
            patch('odoo.sql_db.Cursor.execute', execute),
            patch.object(self.env.registry, 'unaccent', lambda x: x),
        ):
            yield actual_queries
            if flush:
                self.env.cr.flush()

    @contextmanager
    def assertQueries(self, expected, flush=True):
        """ Check the queries made by the current cursor. ``expected`` is a list
        of strings representing the expected queries being made. Query strings
        are matched against each other, ignoring case and whitespaces. Moreover,
        the substring ``"..."`` can be used as a wildcard to match anything in
        the corresponding actual query.
        """
        actual_queries = []

        yield from self._patchExecute(actual_queries, flush)

        if not self.warm:
            return

        # diff lists of queries 'expected' and 'actual_queries'
        queries1 = [QueryLike(query) for query in expected]
        queries2 = [QueryLike(query) for query in actual_queries]
        if queries1 == queries2:
            return

        diff = "\n".join(
            (f"--- {query1}" if query2 is None else
             f"+++ {query2}" if query1 is None else
             f"=== {query2}")
            for query1, query2 in diff_zip(queries1, queries2)
        )
        self.fail(self._formatMessage("\n" + diff, "Not the expected queries"))

    @contextmanager
    def assertQueryCount(self, default=0, flush=True, **counters):
        """ Context manager that counts queries. It may be invoked either with
            one value, or with a set of named arguments like ``login=value``::

                with self.assertQueryCount(42):
                    ...

                with self.assertQueryCount(admin=3, demo=5):
                    ...

            The second form is convenient when used with :func:`users`.
        """
        flush_func = self.env.cr.flush if flush else lambda: None
        if self.warm:
            # mock random in order to avoid random bus gc
            with patch('random.random', lambda: 1):
                login = self.env.user.login
                expected = counters.get(login, default)
                flush_func()
                count0 = self.cr.sql_log_count
                yield
                flush_func()
                count = self.cr.sql_log_count - count0
                if count != expected:
                    # add some info on caller to allow semi-automatic update of query count
                    _frame, filename, linenum, funcname, _lines, _index = inspect.stack()[2]
                    filename = filename.replace('\\', '/')
                    if "/odoo/addons/" in filename:
                        filename = filename.rsplit("/odoo/addons/", 1)[1]
                    if count > expected:
                        msg = "Query count more than expected for user %s: %d > %d in %s at %s:%s"
                        # add a subtest in order to continue the test_method in case of failures
                        with self.subTest():
                            self.fail(msg % (login, count, expected, funcname, filename, linenum))
                    elif expected and not count:
                        msg = "Query count did not detect any queries %s: expected %d in %s at %s:%s"
                        with self.subTest():
                            self.fail(msg % (login, expected, funcname, filename, linenum))
                    else:
                        logger = logging.getLogger(type(self).__module__)
                        msg = "Query count less than expected for user %s: %d < %d in %s at %s:%s"
                        logger.info(msg, login, count, expected, funcname, filename, linenum)
        else:
            # flush before and after during warmup, in order to reproduce the
            # same operations, otherwise the caches might not be ready!
            flush_func()
            yield
            flush_func()

    def assertRecordValues(
            self,
            records: odoo.models.BaseModel,
            expected_values: list[dict],
            *,
            field_names: Iterable[str] | None = None,
    ) -> None:
        ''' Compare a recordset with a list of dictionaries representing the expected results.
        This method performs a comparison element by element based on their index.
        Then, the order of the expected values is extremely important.

        .. note::

            - ``None`` expected values can be used for empty fields.
            - x2many fields are expected by ids (so the expected value should be
              a ``list[int]``
            - many2one fields are expected by id (so the expected value should
              be an ``int``

        :param records: The records to compare.
        :param expected_values: Items to check the ``records`` against.
        :param field_names: list of fields to check during comparison, if
                            unspecified all expected_values must have the same
                            keys and all are checked
        '''
        if not field_names:
            field_names = expected_values[0].keys()
            for i, v in enumerate(expected_values):
                self.assertEqual(
                    v.keys(), field_names,
                    f"All expected values must have the same keys, found differences between records 0 and {i}",
                )

        expected_reformatted = []
        for vs in expected_values:
            r = {}
            for f in field_names:
                t = records._fields[f].type
                if t in ('one2many', 'many2many'):
                    r[f] = sorted(vs[f])
                elif t == 'float':
                    r[f] = float(vs[f])
                elif t == 'integer':
                    r[f] = int(vs[f])
                elif t == 'binary':
                    r[f] = bytes(vs[f])
                elif vs[f] is None:
                    r[f] = False
                else:
                    r[f] = vs[f]
            expected_reformatted.append(r)

        record_reformatted = []
        for record in records:
            r = {}
            for field_name in field_names:
                record_value = record[field_name]
                match record._fields[field_name]:
                    case odoo.fields.Many2one():
                        record_value = record_value.id
                    case odoo.fields.One2many() | odoo.fields.Many2many():
                        record_value = sorted(record_value.ids)
                    case odoo.fields.Float() as field if digits := field.get_digits(record.env):
                        record_value = Approx(record_value, digits[1], decorate=False)
                    case odoo.fields.Monetary() as field if currency_field_name := field.get_currency_field(record):
                        # don't round if there's no currency set
                        if c := record[currency_field_name]:
                            record_value = Approx(record_value, c, decorate=False)
                    case odoo.fields.Binary() as field:
                        record_value = record_value.content

                r[field_name] = record_value
            record_reformatted.append(r)

        try:
            self.assertSequenceEqual(expected_reformatted, record_reformatted, seq_type=list)
            return
        except AssertionError as e:
            standardMsg, _, diffMsg = str(e).rpartition('\n')
            if 'self.maxDiff' not in diffMsg:
                raise
            # move out of handler to avoid exception chaining

        diffMsg = "".join(difflib.unified_diff(
            pprint.pformat(expected_reformatted).splitlines(keepends=True),
            pprint.pformat(record_reformatted).splitlines(keepends=True),
            fromfile="expected", tofile="records",
        ))
        self.fail(self._formatMessage(None, standardMsg + '\n' + diffMsg))

    # turns out this thing may not be quite as useful as we thought...
    def assertItemsEqual(self, a, b, msg=None):
        self.assertCountEqual(a, b, msg=None)

    def assertTreesEqual(self, n1, n2, msg=None):
        self.assertIsNotNone(n1, msg)
        self.assertIsNotNone(n2, msg)
        self.assertEqual(n1.tag, n2.tag, msg)
        # Because lxml.attrib is an ordereddict for which order is important
        # to equality, even though *we* don't care
        self.assertEqual(dict(n1.attrib), dict(n2.attrib), msg)
        self.assertEqual((n1.text or u'').strip(), (n2.text or u'').strip(), msg)
        self.assertEqual((n1.tail or u'').strip(), (n2.tail or u'').strip(), msg)

        for c1, c2 in zip_longest(n1, n2):
            self.assertTreesEqual(c1, c2, msg)

    def _assertXMLEqual(self, original, expected, parser="xml"):
        """Asserts that two xmls archs are equal

        :param original: the xml arch to test
        :type original: str
        :param expected: the xml arch of reference
        :type expected: str
        :param parser: an string representing which lxml.Parser class to use
            when normalizing both archs. Takes either "xml" or "html"
        :type parser: str
        """
        self.maxDiff = 10000
        if original:
            original = _normalize_arch_for_assert(original, parser)
        if expected:
            expected = _normalize_arch_for_assert(expected, parser)
        self.assertEqual(original, expected)

    def assertXMLEqual(self, original, expected):
        return self._assertXMLEqual(original, expected)

    def assertHTMLEqual(self, original, expected):
        return self._assertXMLEqual(original, expected, 'html')

    def profile(self, description='', **kwargs):
        test_method = getattr(self, '_testMethodName', 'Unknown test method')
        if not hasattr(self, 'profile_session'):
            self.profile_session = profiler.make_session(test_method)
        if 'db' not in kwargs:
            kwargs['db'] = self.env.cr.dbname
        return profiler.Profiler(
            description='%s uid:%s %s %s' % (test_method, self.env.user.id, 'warm' if self.warm else 'cold', description),
            profile_session=self.profile_session,
            **kwargs)

    @classmethod
    def file_read(cls, path: str) -> BinaryBytes:
        """Read contents of a file using ``file_open``."""
        with file_open(path, 'rb') as f:
            return BinaryBytes(f.read())

    @classmethod
    @contextmanager
    def registry_test_mode(cls, *, cr: Cursor | None = None, registry: Registry | None = None):
        """ Entering registry test mode.

        New cursors returned by the registry will be instances of `TestCursor`
        which will wrap the current cursor.

        Defined in BaseCase because used by upgrade for IntegrityCase.
        This should be used on TransactionCase only.
        """
        assert not cls._registry_patched, 'Can only patch registry once'
        if cr is None:
            cr = cls.cr
        if registry is None:
            registry = cls.registry
        assert cr, 'No cursor'
        assert registry, 'No registry'

        def _patched_cursor(readonly: bool = False):
            return test_cursor.TestCursor(
                cr, _registry_test_lock, readonly and cls._registry_readonly_enabled
            )

        try:
            from odoo.addons.bus.tools import misc as bus_misc  # noqa: PLC0415
        except ImportError:
            additional_patches = ()
        else:
            og_db_connect = bus_misc.db_connect

            def _patched_ws_db_connect(to, allow_uri=False, readonly=False):
                # acquire_cursor() opens a cursor via db_connect(db_name) directly instead
                # of going through Registry(db_name).cursor(), bypassing the patch above.
                # Redirect it to the test's cursor too.
                if to == cr.dbname:

                    class _TestConnection:
                        def cursor(self):
                            return _patched_cursor(readonly)

                    return _TestConnection()
                return og_db_connect(to, allow_uri=allow_uri, readonly=readonly)

            additional_patches = (
                patch.object(bus_misc, 'db_connect', _patched_ws_db_connect),
            )

        def get_sequences(cr):
            return registry.registry_sequence, registry.cache_sequences.copy()

        with ExitStack() as stack:
            for additional_patch in additional_patches:
                stack.enter_context(additional_patch)
            stack.enter_context(patch.object(cls, '_registry_patched', True))
            # New cursor should point to the test's cursor
            stack.enter_context(patch.object(registry, 'cursor', _patched_cursor))
            # Disable locking and signaling
            stack.enter_context(patch.object(Registry, '_lock', DummyRLock()))
            stack.enter_context(patch.object(registry, 'setup_signaling', return_value=None))  # noop
            yield

    @classmethod
    def set_registry_readonly_mode(cls, enabled: bool):
        assert cls._registry_patched, 'Registry is not patched'

        cls._registry_readonly_enabled = enabled

    def assertCanOpenTestCursor(self):
        """ Asserts that we can currently open a test cursor. """
        if odoo.modules.module.current_test is not self:
            message = f"Trying to open a test cursor for {self.canonical_tag} while already in a test {odoo.modules.module.current_test.canonical_tag}"
            _logger.runbot(message)
            raise BadRequest(message)
        if isinstance(request, Mock):
            return
        if not request or self.http_request_allow_all:
            return
        http_request_required_key = self.http_request_key
        # Read from the raw transmitted cookies rather than request.cookies.
        # The latter can be cleared by a handler (e.g. the force_guest auth
        # method in livechat CORS flows) before a new cursor is opened, which
        # would incorrectly fail this check even though the cookie was sent by
        # the test.
        http_request_key = request.httprequest.cookies.get(TEST_CURSOR_COOKIE_NAME)
        if http_request_key != http_request_required_key:
            expected = http_request_required_key
            if not expected:
                expected = 'None (request are not enabled)'
            _logger.runbot(
                'Request with path %s has been ignored during test as it '
                'it does not contain the test_cursor cookie or it is expired.'
                ' (required "%s", got "%s")',
                request.httprequest.path, expected, http_request_key
            )
            raise BadRequest(
                'Request ignored during test as it does not contain the required cookie.'
            )

    def get_method_additional_tags(self, test_method):
        """Guess if the test_methods is a query_count and adds an `is_query_count` tag on the test
        """
        additional_tags = []
        if odoo.tools.config['test_tags'] and 'is_query_count' in odoo.tools.config['test_tags']:
            method_source = inspect.getsource(test_method) if test_method else ''
            if 'self.assertQueryCount' in method_source:
                additional_tags.append('is_query_count')
        return additional_tags


class CrossModule(case.TestCase):
    _cross_module = True
    _test_modules = []

    def _callTestMethod(self, method):
        method(self._test_modules)

    def _get_canonical_tags_params(self, log=None):
        result = super()._get_canonical_tags_params(log)
        result['module'] = None
        return result


class Like:
    """
        A string-like object comparable to other strings but where the substring
        '...' can match anything in the other string.

        Example of usage:

            self.assertEqual("SELECT field1, field2, field3 FROM model", Like('SELECT ... FROM model'))
            self.assertIn(Like('Company ... (SF)'), ['TestPartner', 'Company 8 (SF)', 'SomeAdress'])
            self.assertEqual([
                'TestPartner',
                'Company 8 (SF)',
                'Anything else'
            ], [
                'TestPartner',
                Like('Company ... (SF)'),
                Like('...'),
            ])

        In case of mismatch, here is an example of error message

            AssertionError: Lists differ: ['TestPartner', 'Company 8 (LA)', 'Anything else'] != ['TestPartner', ~Company ... (SF), ~...]

            First differing element 1:
            'Company 8 (LA)'
            ~Company ... (SF)~

            - ['TestPartner', 'Company 8 (LA)', 'Anything else']
            + ['TestPartner', ~Company ... (SF), ~...]


        """
    def __init__(self, pattern):
        self.pattern = pattern
        self.regex = '.*'.join([re.escape(part.strip()) for part in self.pattern.split('...')])

    def __eq__(self, other):
        return re.fullmatch(self.regex, other.strip(), re.DOTALL)

    def __repr__(self):
        return repr(self.pattern)


class QueryLike(str):
    """ Wrapper for comparing query strings. The comparison ignores case and
    spaces, and the substring ``"..."`` can match anything on the right-hand
    side of operator `==`.
    """
    __slots__ = ('_regex', '_stripped')

    def __init__(self, value):
        # ignore case and spaces when comparing
        self._stripped = "".join(value.lower().split())
        # "..." matches anything
        self._regex = ".*".join(re.escape(part) for part in self._stripped.split('...'))

    def __hash__(self):
        return hash(self._stripped)

    def __eq__(self, other):
        if not isinstance(other, QueryLike):
            return NotImplemented
        return re.fullmatch(self._regex, other._stripped, re.DOTALL)


class WhitespaceInsensitive(str):
    __slots__ = ()

    def __hash__(self):
        return hash(re.sub(r'\s+', ' ', self))

    def __eq__(self, other):
        if not isinstance(other, str):
            return NotImplemented
        return re.sub(r'\s+', ' ', self) == re.sub(r'\s+', ' ', other)


class Approx:  # noqa: PLW1641
    """A wrapper for approximate float comparisons. Uses float_compare under
    the hood.

    Most of the time, :meth:`TestCase.assertAlmostEqual` is more useful, but it
    doesn't work for all helpers.
    """
    def __init__(self, value: float, rounding: int | float | odoo.addons.base.models.res_currency.ResCurrency, /, decorate: bool) -> None:  # noqa: PYI041
        self.value = value
        self.decorate = decorate
        if isinstance(rounding, int):
            self.cmp = partial(float_compare, precision_digits=rounding)
        elif isinstance(rounding, float):
            self.cmp = partial(float_compare, precision_rounding=rounding)
        else:
            self.cmp = rounding.compare_amounts

    def __repr__(self) -> str:
        if self.decorate:
            return f"~{self.value!r}"
        return repr(self.value)

    def __eq__(self, other: object) -> bool | NotImplemented:
        if not isinstance(other, (float, int)):
            return NotImplemented
        return self.cmp(self.value, other) == 0


class TransactionCase(BaseCase):
    """ Test class in which all test methods are run in a single transaction,
    but each test method is run in a sub-transaction managed by a savepoint.
    The transaction's cursor is always closed without committing.

    The data setup common to all methods should be done in the class method
    `setUpClass`, so that it is done once for all test methods. This is useful
    for test cases containing fast tests but with significant database setup
    common to all cases (complex in-db test data).

    After being run, each test method cleans up the record cache and the
    registry cache. However, there is no cleanup of the registry models and
    fields. If a test modifies the registry (custom models and/or fields), it
    should prepare the necessary cleanup (`self.env.transaction.will_change_registry()`).
    """
    muted_registry_logger = mute_logger(odoo.orm.registry._logger.name)
    freeze_time = None
    savepoint = None

    @classmethod
    def _gc_filestore(cls):
        # attachment can be created or unlink during the tests.
        # they can addup during test and take some disc space.
        # since cron are not running during tests, we need to gc manually
        # We need to check the status of the file system outside of the test cursor
        with cls.registry.cursor() as cr:
            gc_env = api.Environment(cr, api.SUPERUSER_ID, {})
            gc_env['ir.attachment']._gc_file_store_unsafe(grace_period=0)

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.registry = Registry(get_db_name())

        def signal_changes(cr, names):
            if 'registry' in names:
                if not cls.registry.ready:
                    _logger.info('Skipping signal changes during tests')
                    return
                _logger.info('Simulating signal changes during tests')
                cls.registry.registry_sequence += 1
                for key, (seq, data) in cls.registry.registry_caches__.items():
                    cls.registry.registry_caches__[key] = (seq + 1, {})
            elif names:
                _logger.debug('Simulating signal changes during tests')
                for name in names:
                    cls.registry.registry_caches__[name] = (cls.registry.registry_caches__[name][0] + 1, {})

        def get_sequences(cr):
            return cls.registry.registry_sequence, {name: val[0] for name, val in cls.registry.registry_caches__.items()}

        def reset_registry(registry, *, registry_sequence, caches):
            registry.registry_sequence = registry_sequence
            registry.registry_caches__ = caches

        cls.addClassCleanup(
            reset_registry, cls.registry,
            registry_sequence=cls.registry.registry_sequence,
            caches=cls.registry.registry_caches__.copy(),
        )

        cls.startClassPatcher(patch.object(cls.registry, '_signal_changes', signal_changes))
        cls.startClassPatcher(patch.object(cls.registry, 'get_sequences', get_sequences))
        cls.addClassCleanup(cls._gc_filestore)

        cls.cr = cls.registry.cursor()
        cls.addClassCleanup(typing.cast('Cursor', cls.cr).close)

        def check_cursor_stack():
            for cursor in test_cursor.TestCursor._cursors_stack:
                _logger.info('One curor was remaining in the TestCursor stack at the end of the test')
                cursor._closed = True
            test_cursor.TestCursor._cursors_stack = []

        cls.addClassCleanup(check_cursor_stack)

        if cls.freeze_time:
            cls.startClassPatcher(cls.freeze_time)

        def forbidden(*args, **kwars):
            traceback.print_stack()
            raise AssertionError('Cannot commit or rollback a cursor from inside a test, this will lead to a broken cursor when trying to rollback the test. Please rollback to a specific savepoint instead or open another cursor if really necessary')

        cls.commit_patcher = patch.object(cls.cr, 'commit', forbidden)
        cls.startClassPatcher(cls.commit_patcher)
        cls.rollback_patcher = patch.object(cls.cr, 'rollback', forbidden)
        cls.startClassPatcher(cls.rollback_patcher)
        cls.close_patcher = patch.object(cls.cr, 'close', forbidden)
        cls.startClassPatcher(cls.close_patcher)

        cls.env = api.Environment(cls.cr, api.SUPERUSER_ID, {})
        cls.env.transaction._wrote__ = True  # isolate tests: avoid propagating cache on rollback

        def guard_create(original_create, model_name, action):
            if action == 'raise':
                @wraps(original_create)
                def guarded_create(self, vals_list):
                    if self._name != model_name:
                        return original_create(self, vals_list)
                    if model_name not in _allowed_create_models.get():
                        raise AssertionError(
                            f"Creating {model_name} records is disabled during tests because it is expensive. "
                            "Reuse test data, or use allow_model_create() around the smallest necessary block."
                        )
                    records = original_create(self, vals_list)
                    return records
            elif action == 'stats':
                @wraps(original_create)
                def guarded_create(self, vals_list):
                    if self._name != model_name:
                        return original_create(self, vals_list)
                    start = real_time()
                    records = original_create(self, vals_list)
                    caller = inspect.stack()[1]
                    formated_caller = f"{caller.filename}:{caller.lineno} in {caller.function}"
                    create_time = real_time() - start
                    if cls.registry._assertion_report:
                        cls.registry._assertion_report.call_stats[f'{model_name}.create'].add_call(create_time)
                    _logger.info('Create of %s took %s in %s', model_name, create_time, formated_caller)
                    return records
            return guarded_create

        for model_name, action in cls._monitored_create_models:
            if model_name not in cls.registry:
                raise ValueError(f"Unknown model guarded against create: {model_name}")
            model_class = cls.registry[model_name]
            # walk up the MRO to find the class that actually owns `create`
            create_owner = next(
                base for base in model_class.__mro__
                if is_model_definition(base) and 'create' in base.__dict__
            )
            cls.startClassPatcher(patch.object(
                create_owner,
                'create',
                guard_create(create_owner.create, model_name, action),
            ))

        # speedup CryptContext. Many password-type logins are done during tests, avoid spending time hashing password with many rounds
        def _crypt_context(self):  # noqa: ARG001
            cryptCtx = CryptContext(
                ['pbkdf2_sha512', 'plaintext'],
                pbkdf2_sha512__rounds=1,
            )
            # The modified hash configuration causes rotation of the in-database password hash values.
            # Rotating password hashes mid-test causes session_id rotation leading into indeterministic 'user not logged in' errors.
            # Never returning a replacement hash prevents this problem.
            original_verify_and_update = cryptCtx.verify_and_update

            def mock_verify_and_update(*args, **kwargs):
                valid, replacement_hash = original_verify_and_update(*args, **kwargs)
                if replacement_hash:
                    _logger.info("Surpressing hash update in CryptContext override")
                return valid, None

            cryptCtx.verify_and_update = mock_verify_and_update
            return cryptCtx

        cls._crypt_context_patcher = patch('odoo.addons.base.models.res_users.ResUsersPatchedInTest._crypt_context', _crypt_context)
        cls.startClassPatcher(cls._crypt_context_patcher)

    def setUp(self):
        super().setUp()

        def reset_registry(registry, *, registry_sequence, caches):
            registry.registry_sequence = registry_sequence
            registry.registry_caches__ = caches

        self.addCleanup(
            # for flushing cursor
            reset_registry, self.registry,
            registry_sequence=self.registry.registry_sequence,
            caches=self.registry.registry_caches__.copy(),
        )

        def _check_registry_lock():
            if _registry_test_lock.count == 0:
                _logger.warning('The registry test lock is still released at the end of %s', self.canonical_tag)
            elif _registry_test_lock.count > 1:
                _logger.warning(
                    'The registry test lock was acquired more than once (%s) at the end of %s',
                    _registry_test_lock.count, self.canonical_tag,
                )

        self.addCleanup(_check_registry_lock)

        # flush everything in setUpClass before introducing a savepoint
        cr = self.cr
        if self.savepoint is None:
            # create savepoint, and close it at class cleanup
            sp = self.cr.savepoint(flush=True)
            self.addClassCleanup(sp.close, rollback=False)
            # store savepoint on the class (to be shared across all test instances)
            self.__class__.savepoint = sp
            self.addClassCleanup(setattr, self.__class__, 'savepoint', None)

        # This prevents precommit functions and data from piling up
        # until cr.flush is called in 'assertRaises' clauses
        def _reset(cb, funcs, data):
            cb._funcs = funcs
            cb.data = data
        for callback in [cr.precommit, cr.postcommit, cr.prerollback, cr.postrollback]:
            self.addCleanup(_reset, callback, deque(callback._funcs), deepcopy(callback.data))

        self.addCleanup(self.savepoint.rollback)

        # To keep tests isolated, add a CacheLayer.
        # - L1: cursor cache
        # - L2: savepoint cache
        # - L3: this isolation layer
        # flushing_cursor() may push data from the current to the parent layer
        # (from L3 to L2) and we need L1 to be unaffected by tests.
        transaction = self.env.transaction
        for name, layer in transaction.ormcaches__.items():
            transaction.ormcaches__[name] = CacheLayer(layer)

    @classmethod
    def add_class_company(cls, xmlid, values=None):
        company = cls.env.ref(xmlid).sudo()
        if values:
            company.write(values)
        cls.env.user.company_ids += company | company.child_ids
        return company

    def add_company(self, xmlid, values=None):
        company = self.env.ref(xmlid).sudo()
        if values:
            company.write(values)
        self.env.user.company_ids += company | company.child_ids
        return company

    @classmethod
    @contextmanager
    def mock_datetime_and_now(cls, mock_dt):
        """ Used when synchronization date (using env.cr.now()) is important
        in addition to standard datetime mocks. Used mainly to detect sync
        issues. """
        mock_dt = fields.Datetime.to_datetime(mock_dt)
        with freeze_time(mock_dt) as frozen_datetime_mock, \
             patch.object(cls.env.cr, 'now', lambda: mock_dt):
            cls.frozen_datetime_mock = frozen_datetime_mock
            yield

    @classmethod
    @contextmanager
    def registry_test_mode(cls, *, cr: Cursor | None = None, registry: Registry | None = None):
        if cr is None:
            cr = cls.cr
        with flushing_cursor(cr), super().registry_test_mode(cr=cr, registry=registry):
            yield

    @typing.final
    def enter_registry_test_mode(self):  # deprecated: alias for registry_test_mode
        return self.registry_test_mode()

    @contextmanager
    def allow_pdf_render(self):
        """
        Allows the pdf renderer to send requests to the backend.
        Enters registry mode if necessary.
        """
        with ExitStack() as stack:
            if not type(self)._registry_patched:
                stack.enter_context(self.registry_test_mode())

            case_instance = self

            def _patched_run_wkhtmltopdf(self, args):
                http_request_key = case_instance.http_request_key
                with (
                    release_test_lock(),
                    patch('odoo.tests.common._disable_flushing_cursor', True),
                ):
                    args = ['--cookie', TEST_CURSOR_COOKIE_NAME, http_request_key, *args]
                    return old_run_wkhtmltopdf(self, args)

            report_model = self.env.registry['ir.actions.report']
            try:
                old_run_wkhtmltopdf = report_model._run_wkhtmltopdf
            except AttributeError:
                pass
            else:
                stack.enter_context(
                    patch.object(report_model, '_run_wkhtmltopdf', _patched_run_wkhtmltopdf),
                )
            yield


class BrowserException(Exception):
    pass


# backward compatibility
ChromeBrowserException = BrowserException


def run(gen_func):
    def done(f):
        try:
            try:
                r = f.result()
            except Exception as e:
                f = coro.throw(e)
            else:
                f = coro.send(r)
        except StopIteration:
            return

        assert isinstance(f, Future), f"coroutine must yield futures, got {f}"
        f.add_done_callback(done)

    coro = gen_func()
    try:
        next(coro).add_done_callback(done)
    except StopIteration:
        return


def save_test_file(test_name, content, prefix, extension='png', logger=_logger, document_type='Screenshot', date_format="%Y%m%d_%H%M%S_%f", loglevel=logging.RUNBOT, directory=''):
    assert re.fullmatch(r'\w*_', prefix)
    assert re.fullmatch(r'[a-z]+', extension)
    assert re.fullmatch(r'\w+', test_name)
    now = datetime.now().strftime(date_format)
    dest = pathlib.Path(odoo.tools.config['screenshots']) / get_db_name() / directory
    dest.mkdir(parents=True, exist_ok=True)
    full_path = dest / f'{prefix}{now}_{test_name}.{extension}'
    full_path.write_bytes(content)
    logger.log(loglevel, "%s in: %s", document_type, full_path)


if os.name == 'posix' and platform.system() != 'Darwin':
    # since the introduction of pointer compression in Chrome 80 (v8 v8.0),
    # the memory reservation algorithm requires more than 8GiB of
    # virtual mem for alignment this exceeds our default memory limits.
    def _preexec():
        import resource  # noqa: PLC0415
        resource.setrlimit(resource.RLIMIT_AS, (resource.RLIM_INFINITY, resource.RLIM_INFINITY))
else:
    _preexec = None


class BidiTransport:
    """ Exchanges WebDriver BiDi messages with a browser over a websocket.

    This is the transport for browsers implementing BiDi natively, which
    expose it on a websocket endpoint (e.g. Firefox's ``/session``).
    """
    def __init__(self, ws: websocket.WebSocket, logger: logging.Logger):
        self.ws = ws
        self._logger = logger

    @property
    def connected(self) -> bool:
        return self.ws.connected

    def send(self, message: dict) -> None:
        self.ws.send(json.dumps(message))

    def recv(self) -> dict | None:
        """ Returns the next BiDi message, or ``None`` if nothing was received.

        Raises the websocket errors, notably ``WebSocketTimeoutException``
        and ``WebSocketConnectionClosedException``.
        """
        msg = self.ws.recv()
        return json.loads(msg) if msg else None


class MapperBidiTransport(BidiTransport):
    """ Tunnels WebDriver BiDi through the Chrome DevTools Protocol.

    Chrome only speaks CDP, its BiDi implementation (chromium-bidi) is a
    "mapper" translating BiDi to CDP from inside a dedicated tab. This is how
    chromedriver provides BiDi: the mapper is loaded in a new tab given access
    to the browser's CDP connection, BiDi commands are delivered by calling
    ``onBidiMessage`` in that tab, and BiDi responses and events come back
    through the ``sendBidiResponse`` binding.

    ``ws`` must be connected to the *browser* CDP endpoint.
    """
    def __init__(self, ws: websocket.WebSocket, logger: logging.Logger, mapper_source: str):
        super().__init__(ws, logger)
        self._cdp_ids = itertools.count(1)
        target_id = self._cdp_request('Target.createTarget', {'url': 'about:blank', 'background': True})['targetId']
        self.session_id = self._cdp_request('Target.attachToTarget', {'targetId': target_id, 'flatten': True})['sessionId']
        self._cdp_request('Target.exposeDevToolsProtocol', {'targetId': target_id, 'bindingName': 'cdp'})
        self._cdp_request('Runtime.enable', session_id=self.session_id)
        self._cdp_request('Runtime.addBinding', {'name': 'sendBidiResponse'}, session_id=self.session_id)
        for expression in [mapper_source, f'window.runMapperInstance({json.dumps(target_id)})']:
            result = self._cdp_request('Runtime.evaluate', {
                'expression': expression,
                'awaitPromise': True,
            }, session_id=self.session_id)
            if details := result.get('exceptionDetails'):
                raise unittest.SkipTest(f"Failed to start the BiDi mapper: {details.get('exception', details)}")

    def _cdp_send(self, method, params=None, session_id=None):
        message_id = next(self._cdp_ids)
        message = {'id': message_id, 'method': method, 'params': params or {}}
        if session_id:
            message['sessionId'] = session_id
        self.ws.send(json.dumps(message))
        return message_id

    def _cdp_request(self, method, params=None, session_id=None, timeout=10.0):
        """ Synchronous CDP request, only usable before messages are consumed
        by the receiver, CDP events received meanwhile are dropped.
        """
        message_id = self._cdp_send(method, params, session_id)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                msg = self.ws.recv()
            except websocket.WebSocketTimeoutException:
                continue
            res = json.loads(msg) if msg else {}
            if res.get('id') == message_id:
                if 'error' in res:
                    raise BrowserException(f"{method}: {res['error']['message']}")
                return res['result']
        raise TimeoutError(f'{method}({params or ""})')

    def send(self, message: dict) -> None:
        self._cdp_send('Runtime.evaluate', {
            'expression': f'onBidiMessage({json.dumps(json.dumps(message))})',
        }, session_id=self.session_id)

    def recv(self) -> dict | None:
        msg = self.ws.recv()
        if not msg:
            return None
        res = json.loads(msg)
        if res.get('sessionId') != self.session_id:
            return None
        match res.get('method'):
            case 'Runtime.bindingCalled' if res['params']['name'] == 'sendBidiResponse':
                return json.loads(res['params']['payload'])
            case 'Runtime.exceptionThrown':
                self._logger.warning("BiDi mapper error: %s", res['params']['exceptionDetails'])
            case None if 'error' in res:
                self._logger.warning("Failed to deliver BiDi message: %s", res['error'])
        return None


class Browser:
    """ Helper object to control a browser through WebDriver BiDi.

    The browser-agnostic part: subclasses launch the browser, and provide the
    transport to its BiDi endpoint (:meth:`_start`) as well as browser
    specific capabilities (e.g. CPU throttling, screencasts).
    """
    name = 'Browser'
    log_prefix = 'browser_log_'

    def __init__(self, test_case: HttpCase, success_signal: str = DEFAULT_SUCCESS_SIGNAL, headless: bool = True, debug: bool = False):
        self.cleanup = ExitStack()
        self.throttling_factor = 1
        self._logger = test_case._logger
        self.test_case = test_case
        self.success_signal = success_signal
        if websocket is None:
            self._logger.warning("websocket-client module is not installed")
            raise unittest.SkipTest("websocket-client module is not installed")
        self.user_data_dir = self.cleanup.enter_context(
            tempfile.TemporaryDirectory(
                suffix=f'_{self.name.lower()}_odoo',
                ignore_cleanup_errors=True,
            )
        )
        self.cleanup.callback(
            self._logger.info,
            'Removing %s user profile "%s"',
            self.name,
            self.user_data_dir,
        )
        self.browser_log_level = logging.RUNBOT
        self.cleanup.callback(
            lambda: save_test_file(
                self.test_case._testMethodName,
                self.read_log(),
                prefix=self.log_prefix,
                extension='txt',
                document_type=f"{self.name} Log",
                logger=self._logger,
                loglevel=self.browser_log_level,
                directory=self.log_prefix.rstrip('_') + 's',
            )
        )

        if os.name == 'posix':
            sigxcpu_handler = signal.signal(signal.SIGXCPU, self.signal_handler)
            self.cleanup.callback(
                signal.signal, signal.SIGXCPU, sigxcpu_handler)

        test_case.browser_size = test_case.browser_size.replace('x', ',')
        try:
            self._connect(headless, debug)
        except BaseException:
            self.stop()
            raise

    def _connect(self, headless, debug):
        test_case = self.test_case
        self.transport = self.cleanup.enter_context(self._start(
            touch_enabled=test_case.touch_enabled,
            headless=headless,
            debug=debug,
        ))

        self._request_id = itertools.count()
        self._result = Future()
        self.error_checker = None
        self.had_failure = False
        # maps request_id to Futures
        self._responses = {}
        self._handlers = {
            'log.entryAdded': self._handle_log_entry,
            'network.beforeRequestSent': self._handle_before_request_sent,
        }
        self._receiver = threading.Thread(
            target=self._receive,
            name="BiDi events consumer",
            args=(get_db_name(),)
        )
        self._receiver.start()

        capabilities = self._request('session.new', params={
            'capabilities': {'alwaysMatch': self._capabilities()},
        })['capabilities']
        self._logger.info('Browser: %s %s', capabilities['browserName'], capabilities['browserVersion'])
        self.context = self._open_context()
        self._setup()
        self.cleanup.callback(self._winddown)

        if scs := odoo.tools.config['screencasts']:
            self.screencaster = self.cleanup.enter_context(self._screencaster(scs))
        else:
            self.screencaster = self.cleanup.enter_context(NoScreencast())

    def _open_context(self) -> str:
        """ Returns the browsing context (tab) to run the tests in. """
        contexts = self._request('browsingContext.getTree', params={'maxDepth': 0})['contexts']
        if contexts:
            return contexts[0]['context']
        return self._request('browsingContext.create', params={'type': 'tab'})['context']

    def _capabilities(self) -> dict:
        """ Capabilities requested for the BiDi session. """
        return {
            'acceptInsecureCerts': False,
            'webSocketUrl': True,
        }

    def _setup(self):
        """ Configures the BiDi session, and the browser itself. """
        self._logger.info('Enable browser log and network notifications')
        self._request('session.subscribe', params={'events': list(self._handlers)})
        # Only requests to external servers are proxied, but as intercepts
        # can't exclude urls all requests are paused and checked.
        self._request('network.addIntercept', params={'phases': ['beforeRequestSent']})
        self._request('script.addPreloadScript', params={'functionDeclaration': PRELOAD_CONSOLE})
        try:
            self._request('browser.setDownloadBehavior', params={
                'downloadBehavior': {'type': 'denied'},
            })
        except BrowserException as e:
            self._logger.info("Could not deny downloads: %s", e)
        width, height = [int(size) for size in self.test_case.browser_size.split(",")]
        self._request('browsingContext.setViewport', params={
            'context': self.context,
            'viewport': {'width': width, 'height': height},
            'devicePixelRatio': 1,
        })

    def _winddown(self):
        try:
            self._request('script.evaluate', params={
                'expression': """
                window.stop();
                ('serviceWorker' in navigator) &&
                    navigator.serviceWorker.getRegistrations().then(
                        registrations => Promise.all(registrations.map(r => r.unregister()))
                    )
                """,
                'target': {'context': self.context},
                'awaitPromise': True,
                'resultOwnership': 'none',
            })
            # wait for the screenshot or whatever
            wait(self._responses.values(), 10)
            self._result.cancel()

            self._logger.info("Closing %s with pid %s", self.name, self.process.pid)
            with contextlib.suppress(CancelledError):
                # the connection may get closed before the response is received
                self._request('browser.close')
        except BrowserException as e:
            _logger.runbot("BiDi error during browser shutdown: %s", e)
            self.browser_log_level = logging.RUNBOT
        except Exception:  # noqa: BLE001
            _logger.warning("Error during browser shutdown", exc_info=True)
            self.browser_log_level = logging.RUNBOT

    def signal_handler(self, sig, frame):
        if sig == signal.SIGXCPU:
            _logger.info('CPU time limit reached, stopping %s and shutting down', self.name)
            self.stop()
            exit()

    def throttle(self, factor: int | None) -> None:
        if not factor:
            return

        assert 1 <= factor <= 50  # arbitrary upper limit
        self.throttling_factor = factor
        self._throttle(factor)

    def _throttle(self, factor: int) -> None:
        self._logger.warning("CPU throttling is not supported by %s, only timeouts are extended", self.name)

    def stop(self):
        self.cleanup.close()

    @contextlib.contextmanager
    def _start(self, touch_enabled: bool, headless=True, debug=False) -> typing.Iterator[BidiTransport]:
        """ Launches the browser (as ``self.process``) and yields a transport
        connected to its BiDi endpoint.
        """
        raise NotImplementedError

    def read_log(self) -> bytes:
        return b''

    def _terminate(self, proc: subprocess.Popen) -> None:
        """ Terminates the browser process and its descendants. """
        self._logger.info("Terminating %s with pid %s", self.name, proc.pid)
        main = psutil.Process(proc.pid)
        procs = [main] + main.children(recursive=True)
        proc.terminate()
        _, alive = psutil.wait_procs(procs, 5)
        if alive:
            self._logger.warning(
                "Killing %s descendants-or-self of %s: %d remaining%s",
                self.name,
                proc.pid,
                len(alive),
                "".join(f"\n- {p.name()} ({p.status()})" for p in alive),
            )
            for p in alive:
                p.kill()
            psutil.wait_procs(alive, 1)
            self.browser_log_level = logging.RUNBOT

    def _screencaster(self, directory: str) -> NoScreencast:
        self._logger.warning("Screencasts are not supported by %s", self.name)
        return NoScreencast()

    def _log_heap_usage(self) -> None:
        """ Logs the heap usage of the page, when the browser supports it. """

    def _receive(self, dbname):
        threading.current_thread().dbname = dbname
        # BiDi messages are either command responses {type: success | error, id, ...}
        # or events {type: event, method, params}
        while True:  # or maybe until `self._result` is `done()`?
            try:
                res = self.transport.recv()
                if not res:
                    continue
                self._logger.debug('\n<- %s', res)
            except websocket.WebSocketTimeoutException:
                continue
            except websocket.WebSocketConnectionClosedException as e:
                if not self._result.done():
                    self._result.set_exception(e)
                del self.transport
                while True:
                    try:
                        _, f = self._responses.popitem()
                    except KeyError:
                        break
                    else:
                        f.cancel()
                return
            except Exception as e:
                if isinstance(e, ConnectionResetError) and self._result.done():
                    return
                # if the socket is still connected something bad happened,
                # otherwise the client was just shut down
                if self.transport.connected:
                    self._result.set_exception(e)
                    raise
                self._result.cancel()
                return

            try:
                match res.get('type'):
                    case 'event':
                        if handler := self._handlers.get(res['method']):
                            handler(**res['params'])
                    case 'success':
                        if f := self._responses.pop(res['id'], None):
                            f.set_result(res['result'])
                    case 'error':
                        f = self._responses.pop(res.get('id'), None)
                        error = BrowserException(f"{res['error']}: {res.get('message', '')}")
                        if f:
                            f.set_exception(error)
                        elif res.get('id') is None:
                            self._logger.warning("BiDi error: %s", error)
                        else:
                            # e.g. continuing a request cancelled meanwhile
                            self._logger.debug("BiDi error: %s", error)
            except Exception:
                _logger.exception(
                    "While processing message %s",
                    shorten(str(res), 500, placeholder='...'),
                )

    def _request(self, method, *, params=None, timeout=10.0):
        assert threading.get_ident() != self._receiver.ident,\
            "_request must not be called from the consumer thread"
        if not hasattr(self, 'transport'):
            return None
        if DISABLE_TIMEOUTS:
            timeout = None
        else:
            timeout *= self.throttling_factor

        f = self._send(method, params=params, with_future=True)
        try:
            return f.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            raise TimeoutError(f'{method}({params or ""})')

    def _send(self, method, *, params=None, with_future=False):
        """send BiDi commands through the transport

        If ``with_future`` is set, returns a ``Future`` for the operation.
        """
        if not hasattr(self, 'transport'):
            return None

        result = None
        request_id = next(self._request_id)
        if with_future:
            result = self._responses[request_id] = Future()
        payload = {'id': request_id, 'method': method, 'params': params or {}}
        self._logger.debug('\n-> %s', payload)
        self.transport.send(payload)
        return result

    def _handle_before_request_sent(self, request, isBlocked=False, **kw):
        if not isBlocked:
            return
        url = request['url']
        if url.startswith(f'http://{HOST}'):
            cmd = 'network.continueRequest'
            params = {}
        else:
            cmd = 'network.provideResponse'
            response = self.test_case.fetch_proxy(url)
            params = {
                'statusCode': response['responseCode'],
                'headers': [
                    {'name': header['name'], 'value': {'type': 'string', 'value': header['value']}}
                    for header in response['responseHeaders']
                ],
                'body': {'type': 'base64', 'value': response['body']},
            }
        try:
            self._send(cmd, params={'request': request['request'], **params})
        except websocket.WebSocketConnectionClosedException:
            pass
        except (BrokenPipeError, ConnectionResetError, OSError):
            # this can happen if the browser is closed. Just ignore it.
            _logger.info("Websocket error while handling request %s", url)

    def _handle_log_entry(self, type, level, source, text=None, stackTrace=None, method=None, args=None, **kw):  # pylint: disable=redefined-builtin
        if 'context' not in source:
            # not from a page (e.g. a worker)
            self._logger.debug("Ignored log entry from %s: %s", source, text)
            return
        if type == 'javascript':
            self._handle_exception(text, stackTrace)
        else:
            self._handle_console(method or level, args, stackTrace, text)

    def _handle_console(self, method, args=None, stackTrace=None, text=None):
        # console formatting differs somewhat from Python's, if args[0] has
        # format modifiers that many of args[1:] get formatted in, missing
        # args are replaced by empty strings and extra args are concatenated
        # (space-separated)
        #
        # current version modifies the args in place which could and should
        # probably be improved
        if args:
            arg0, args = str(self._from_remote_value(args[0])), args[1:]
        else:
            arg0, args = text or '', []
        formatted = [re.sub(r'%[%sdfoOc]', self.console_formatter(args), arg0)]
        # formatter consumes args it uses, leaves unformatted args untouched
        formatted.extend(str(self._from_remote_value(arg)) for arg in args)
        message = ' '.join(formatted)
        if method == 'trace':
            stack = ''.join(self._format_stack(stackTrace))
            if stack:
                message += '\n' + stack

        log_type = method
        _logger = self._logger.getChild('browser')
        if self._result.done() and IGNORED_MSGS(message):
            log_type = 'dir'
        _logger.log(
            self._TO_LEVEL.get(log_type, logging.INFO),
            "%s%s",
            "Error received after termination: " if self._result.done() else "",
            message # might still have %<x> characters
        )

        if log_type == 'error':
            self.had_failure = True
            if self._result.done():
                return
            if not self.error_checker or self.error_checker(message):
                self.take_screenshot()
                try:
                    self._result.set_exception(BrowserException(message))
                except CancelledError:
                    ...
                except InvalidStateError:
                    self._logger.warning(
                        "Trying to set result to failed (%s) but found the future settled (%s)",
                        message, self._result
                    )
        elif message == self.success_signal:
            self._log_heap_usage()

            @run
            def _check_form():
                dirty = False

                with contextlib.suppress(Exception):
                    r = yield self._send('script.evaluate', params={
                        'expression': "!!document.querySelector('.o_form_dirty')",
                        'target': {'context': self.context},
                        'awaitPromise': False,
                        'resultOwnership': 'none',
                    }, with_future=True)
                    dirty = r.get('result') == {'type': 'boolean', 'value': True}

                if dirty:
                    self.take_screenshot("unsaved_form_")
                    msg = """\
Tour finished with a dirty form view being open.

Dirty form views are automatically saved when the page is closed, \
which leads to stray network requests and inconsistencies."""
                    if self._result.done():
                        _logger.error("%s", msg)
                    else:
                        self._result.set_exception(BrowserException(msg))
                    return

                if not self._result.done():
                    self._result.set_result(True)
                elif self._result.exception() is None:
                    _logger.error("Tried to make the tour successful twice.")

    def _handle_exception(self, text, stackTrace=None):
        message = text or 'Uncaught exception'
        stack = ''.join(self._format_stack(stackTrace))
        if stack:
            message += '\n' + stack

        if self._result.done():
            if not IGNORED_MSGS(message):
                self._logger.getChild('browser').error(
                    "Exception received after termination: %s", message)
            return

        self.take_screenshot()
        try:
            self._result.set_exception(BrowserException(message))
        except CancelledError:
            ...
        except InvalidStateError:
            self._logger.warning(
                "Trying to set result to failed (%s) but found the future settled (%s)",
                message, self._result
            )

    _TO_LEVEL = {
        'debug': logging.DEBUG,
        'log': logging.INFO,
        'info': logging.INFO,
        'warn': logging.WARNING,
        'error': logging.ERROR,
        'dir': logging.RUNBOT,
        # TODO: what do with
        # dirxml, table, trace, clear, group, groupCollapsed, groupEnd,
        # assert, profile, profileEnd, count, countReset, time, timeLog, timeEnd
    }

    def take_screenshot(self, prefix='sc_') -> Future[dict]:
        def handler(f):
            try:
                base_png = f.result(timeout=0)['data']
            except Exception as e:  # noqa: BLE001  done callback, must not raise
                self._logger.runbot("Couldn't capture screenshot: %s", e)
                return
            if not base_png:
                self._logger.runbot("Couldn't capture screenshot: expected image data, got %r", base_png)
                return
            decoded = binascii.a2b_base64(base_png)
            save_test_file(self.test_case._testMethodName, decoded, prefix, logger=self._logger, directory='screenshots')

        self._logger.info('Asking for screenshot')
        f = self._send('browsingContext.captureScreenshot', params={'context': self.context}, with_future=True)
        if f:
            f.add_done_callback(handler)
        return f

    def set_cookie(self, name, value, path, domain):
        self._request('storage.setCookie', params={'cookie': {
            'name': name,
            'value': {'type': 'string', 'value': value},
            'path': path,
            'domain': domain,
        }})

    def delete_cookie(self, name, **kwargs):
        cookie_filter = {k: v for k, v in kwargs.items() if k in ['domain', 'path']}
        if 'url' in kwargs and 'domain' not in cookie_filter:
            cookie_filter['domain'] = urlsplit(kwargs['url']).hostname
        cookie_filter['name'] = name
        self._request('storage.deleteCookies', params={'filter': cookie_filter})

    def _evaluate(self, expression, timeout):
        return self._request('script.evaluate', params={
            'expression': expression,
            'target': {'context': self.context},
            'awaitPromise': True,
            'resultOwnership': 'none',
        }, timeout=timeout)

    def _wait_ready(self, ready_code=None, timeout=60):
        if timeout:
            timeout *= self.throttling_factor
        ready_code = ready_code or "document.readyState === 'complete'"
        self._logger.info('Evaluate ready code "%s"', ready_code)
        start_time = time.time()
        result = None
        while True:
            taken = time.time() - start_time
            if taken > timeout:
                break

            try:
                result = self._evaluate("try { %s } catch {}" % ready_code, timeout=timeout - taken).get('result')
            except CancelledError:
                exc = self._result.done() and self._result.exception()
                if exc:
                    raise exc from None
                result = "cancelled"
            except BrowserException as e:
                # e.g. the realm got destroyed by a navigation
                result = str(e)

            if result == {'type': 'boolean', 'value': True}:
                time_to_ready = time.time() - start_time
                if taken > 2:
                    self._logger.info('The ready code tooks too much time : %s', time_to_ready)
                return True

        exc = self._result.done() and self._result.exception()
        if exc:
            raise exc from None
        self.take_screenshot(prefix='sc_failed_ready_')
        self._logger.info('Ready code last try result: %s', result)
        return False

    def _wait_code_ok(self, code, timeout, error_checker=None):
        if timeout:
            timeout *= self.throttling_factor
        self.error_checker = error_checker
        self._logger.info('Evaluate test code "%s"', code)
        start = time.time()
        res = self._evaluate(code, timeout=timeout)
        if res['type'] == 'exception' or res['result']['type'] == 'error':
            raise BrowserException("Running code returned an error: %s" % res)

        err = BrowserException("failed")
        try:
            # if the runcode was a promise which took some time to execute,
            # discount that from the timeout
            if self._result.result(time.time() - start + timeout) and not self.had_failure:
                self.browser_log_level = logging.INFO
                return
        except CancelledError:
            # regular-ish shutdown
            self.browser_log_level = logging.INFO
            return
        except BrowserException:
            self.screencaster.save()
            raise
        except Exception as e:  # noqa: BLE001  reported as an unknown error below
            err = e

        self.take_screenshot()
        self.screencaster.save()

        if isinstance(err, concurrent.futures.TimeoutError):
            raise BrowserException('Script timeout exceeded') from err
        raise BrowserException("Unknown error") from err

    def navigate_to(self, url, wait_stop=False):
        self._logger.info('Navigating to: "%s"', url)
        timeout = 1e6 if DISABLE_TIMEOUTS else 20.0
        if wait_stop:
            self._logger.info('Waiting for %r to stop loading', url)
            timeout += 10
        try:
            nav_result = self._request('browsingContext.navigate', params={
                'context': self.context,
                'url': url,
                'wait': 'complete' if wait_stop else 'none',
            }, timeout=timeout)
        except TimeoutError:
            if not wait_stop:
                raise
            self._logger.info('Page %r did not stop loading', url)
        else:
            self._logger.info("Navigation result: %s", nav_result)

    def _from_remote_value(self, arg, nested=False):
        """ attempts to make a BiDi RemoteValue comprehensible

        Top-level objects and arrays are displayed with their (non-recursive)
        content, nested ones as their type.
        """
        objtype = arg['type']
        value = arg.get('value')
        match objtype:
            case 'undefined' | 'null':
                return objtype
            case 'string':
                return repr(value) if nested else value
            case 'boolean':
                return 'true' if value else 'false'
            case 'number':
                return value
            case 'bigint':
                return f'{value}n'
            case 'date':
                return value
            case 'regexp':
                return f"/{value['pattern']}/{value.get('flags', '')}"
            case 'node':
                return f"<{value['localName']}>" if value and value.get('localName') else 'Node'
            case 'array' | 'set' if nested:
                return 'Array' if objtype == 'array' else 'Set'
            case 'array' | 'set':
                return '[%s]' % ', '.join(
                    str(self._from_remote_value(item, nested=True))
                    for item in value or []
                )
            case 'object' | 'map' if nested:
                return 'Object' if objtype == 'object' else 'Map'
            case 'object' | 'map':
                return '%s(%s)' % (
                    'Object' if objtype == 'object' else 'Map',
                    ', '.join(
                        '%s=%s' % (
                            key if isinstance(key, str) else self._from_remote_value(key),
                            self._from_remote_value(val, nested=True),
                        )
                        for key, val in value or []
                    ),
                )
        # error, function, symbol, promise, window, ...
        return objtype.capitalize()

    LINE_PATTERN = '\tat %(functionName)s (%(url)s:%(lineNumber)d:%(columnNumber)d)\n'

    def _format_stack(self, stack_trace):
        if stack_trace:
            for f in stack_trace['callFrames']:
                yield self.LINE_PATTERN % f

    def console_formatter(self, args):
        """ Formats similarly to the console API:

        * if there are no args, don't format (return string as-is)
        * %% -> %
        * %c -> replace by styling directives (ignore for us)
        * other known formatters -> replace by corresponding argument
        * leftover known formatters (args exhausted) -> replace by empty string
        * unknown formatters -> return as-is
        """
        if not args:
            return lambda m: m[0]

        def replacer(m):
            fmt = m[0][1]
            if fmt == '%':
                return '%'
            if fmt in 'sdfoOc':
                if not args:
                    return ''
                repl = args.pop(0)
                if fmt == 'c':
                    return ''
                return str(self._from_remote_value(repl))
            return m[0]
        return replacer


# Normalizes console messages before they get serialized for BiDi:
# * errors are formatted with their stack, as with CDP: BiDi serializes them
#   as an opaque {type: "error"}
# * format strings are applied when their specifiers don't match the
#   arguments, otherwise chromium-bidi fails to format the message's text and
#   drops the log entry
# * styles (%c) are dropped, Firefox splits the message's text on them
PRELOAD_CONSOLE = """() => {
    const toString = Object.prototype.toString;
    const formatError = (arg) => {
        if (!(arg instanceof Error || toString.call(arg) === "[object Error]")) {
            return arg;
        }
        const head = String(arg);
        const stack = typeof arg.stack === "string" ? arg.stack : "";
        return stack.startsWith(head) ? stack : [head, stack].filter(Boolean).join("\\n");
    };
    const SPECIFIERS = /%[sdifoOc]/g;
    const formatArgs = (args) => {
        const [first, ...rest] = args;
        if (typeof first !== "string") {
            return args;
        }
        const count = (first.match(SPECIFIERS) || []).length;
        if (count === rest.length) {
            let index = 0;
            const styles = new Set();
            const text = first.replace(SPECIFIERS, (specifier) => {
                if (specifier === "%c") {
                    styles.add(index++);
                    return "";
                }
                index++;
                return specifier;
            });
            return [text, ...rest.filter((_, i) => !styles.has(i))];
        }
        const text = first.replace(SPECIFIERS, (specifier) => {
            if (!rest.length) {
                return "";
            }
            const arg = rest.shift();
            switch (specifier) {
                case "%c":
                    return "";
                case "%d":
                case "%i":
                    return String(parseInt(arg, 10));
                case "%f":
                    return String(parseFloat(arg));
                default:
                    return String(arg);
            }
        });
        return [text, ...rest];
    };
    for (const method of ["debug", "dir", "error", "info", "log", "warn"]) {
        const original = console[method];
        console[method] = function (...args) {
            return original.apply(this, formatArgs(args.map(formatError)));
        };
    }
}"""


class ChromeBrowser(Browser):
    """ Helper object to control a Chrome headless process.

    Chrome doesn't implement BiDi natively, it is provided by the
    chromium-bidi mapper, see :class:`MapperBidiTransport`. Chrome specific
    features unavailable in BiDi go through the mapper's ``goog:cdp``
    extension module.
    """
    name = 'Chrome'
    log_prefix = 'chrome_log_'
    remote_debugging_port = 0  # 9222, change it in a non-git-tracked file

    def _setup(self):
        super()._setup()
        self._cdp_session = self._request('goog:cdp.getSession', params={'context': self.context})['session']
        self._cdp_request('Emulation.setFocusEmulationEnabled', {'enabled': True})

    def _cdp_send(self, method, params=None) -> Future | None:
        """ Sends a CDP command to the page, returns a future of its result. """
        f = self._send('goog:cdp.sendCommand', params={
            'method': method,
            'params': params or {},
            'session': self._cdp_session,
        }, with_future=True)
        if f is None:
            return None
        result = Future()

        def unwrap(f):
            if f.cancelled():
                result.cancel()
            elif exc := f.exception():
                result.set_exception(exc)
            else:
                result.set_result(f.result()['result'])
        f.add_done_callback(unwrap)
        return result

    def _cdp_request(self, method, params=None):
        return self._request('goog:cdp.sendCommand', params={
            'method': method,
            'params': params or {},
            'session': self._cdp_session,
        })['result']

    def _throttle(self, factor):
        self._cdp_request('Emulation.setCPUThrottlingRate', {'rate': factor})

    def _screencaster(self, directory):
        return Screencaster(self, directory)

    def _log_heap_usage(self):
        @run
        def _get_heap():
            yield self._cdp_send("HeapProfiler.collectGarbage")
            r = yield self._cdp_send("Runtime.getHeapUsage")
            self._logger.getChild('browser').info("heap %d (allocated %d)", r['usedSize'], r['totalSize'])

    @property
    def executable(self):
        try:
            return _find_executable()
        except Exception:
            self._logger.warning('Chrome executable not found')
            raise

    def _spawn_chrome(self, cmd):
        # pylint: disable=subprocess-popen-preexec-fn
        proc = subprocess.Popen(
            cmd,
            stderr=subprocess.DEVNULL,
            preexec_fn=_preexec,  # ruff: ignore[subprocess-popen-preexec-fn]
            env={**os.environ, 'TMPDIR': self.user_data_dir},
        )  # noqa: PLW1509

        port_file = pathlib.Path(self.user_data_dir, 'DevToolsActivePort')
        for _ in range(CHECK_BROWSER_ITERATIONS):
            time.sleep(CHECK_BROWSER_SLEEP)
            if port_file.is_file() and port_file.stat().st_size >= 5:
                with port_file.open('r', encoding='utf-8') as f:
                    return proc, int(f.readline())

        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
        self._logger.warning(
            'Chrome headless failed to start:\n%s',
            self.read_log().decode(),
        )
        if port_file.is_file():
            content = port_file.read_text('utf-8')
            _logger.warning('DevToolsActivePort content: %r', content)
        else:
            _logger.warning('DevToolsActivePort not found')
        self.stop()

        raise unittest.SkipTest(f'Failed to detect chrome devtools port after {BROWSER_WAIT:.1f}s.')

    @contextlib.contextmanager
    def _start(self, touch_enabled, headless=True, debug=False):
        mapper_source = _read_bidi_mapper()
        with self._chrome_start(
            user_data_dir=self.user_data_dir,
            touch_enabled=touch_enabled,
            headless=headless,
            debug=debug,
        ) as (self.process, self.devtools_port), self._open_websocket() as ws:
            self._logger.info('Starting the BiDi mapper')
            yield MapperBidiTransport(ws, self._logger, mapper_source)

    @contextlib.contextmanager
    def _chrome_start(
            self,
            user_data_dir: str,
            touch_enabled: bool,
            headless=True,
            debug=False,
    ):
        headless_switches = {
            '--headless': '',
            '--disable-extensions': '',  # Disable all chrome extensions
            '--disable-component-extensions-with-background-pages': '',  # Disable built-in extensions (e.g., PDF viewer, Hangouts...)
            '--disable-background-networking': '',  # Stop background requests (telemetry, updates, safe browsing)
            '--disable-background-timer-throttling': '',  # Prevent Chrome from slowing down JS in inactive tabs
            '--disable-backgrounding-occluded-windows': '',  # Prevent Chrome from suspending hidden windows
            '--disable-renderer-backgrounding': '',  # Keep background rendering processes running at normal priority
            '--disable-breakpad': '',  # Disable the Breakpad crash reporting system
            '--disable-client-side-phishing-detection': '',  # Disable local machine-learning phishing analysis
            '--disable-crash-reporter': '',  # Disable crash report generation
            '--disable-dev-shm-usage': '',  # Use /tmp instead of /dev/shm
            '--disable-namespace-sandbox': '',  # Disable Linux namespace sandboxing
            '--disable-sync': '',  # Completely disable Google account synchronization engine
            '--no-crash-upload': '',  # Prevent uploading crash dumps to Google servers
            '--no-sandbox': '',  # Disable OS-level sandboxing
            '--disable-gpu': '',  # Disable hardware GPU acceleration
            '--enable-unsafe-swiftshader': '',  # Allow software rendering fallback for WebGL when GPU is disabled
            '--mute-audio': '',  # Prevent audio playback from allocating system resources
            '--font-render-hinting': 'none',  # Disable sub-pixel font rendering calculations
            '--disable-gpu-early-init': '',  # Disable proactive early init of GPU process
            '--disable-gpu-sandbox': '',  # Disables the GPU process sandbox
            '--disable-gpu-driver-bug-workarounds': '',  # Disable workarounds for various GPU driver bugs
        }
        switches = {
            # required for tours that use Youtube autoplay conditions (namely website_slides' "course_tour")
            '--autoplay-policy': 'no-user-gesture-required',  # Allow media autoplay without requiring a user click
            '--disable-default-apps': '',  # Disable installation of default apps
            '--disable-domain-reliability': '',  # Stop tracking and sending telemetry for failed network requests
            '--disable-search-engine-choice-screen': '',  # Bypass the EU search engine selection prompt on startup
            '--disable-features': ','.join([  # ruff: ignore[static-join-to-f-string]
                'Translate',  # Disables Chrome translation
                'MediaRouter',  # Stop scanning for local Cast or media devices
                'InterestFeedContentSuggestions',  # Disables the Discover feed on NTP
            ]),
            '--ash-no-nudges': '',  # Avoids blue bubble "user education" nudges (eg., "… give your browser a new look", Memory Saver)
            '--propagate-iph-for-testing': '',  # Disable all in-product help (IPH) features
            '--no-default-browser-check': '',  # Bypass the prompt asking to make Chrome the default browser
            '--no-first-run': '',  # Skip the welcome screen and first-run setup wizards
            '--proxy-server': '"direct://"',  # Force a direct connection, bypassing any system proxies
            '--proxy-bypass-list': '*',  # Bypass proxy for all domains (eliminates local resolution delays)
            '--remote-debugging-address': HOST,
            '--remote-debugging-port': str(self.remote_debugging_port),
            '--user-data-dir': user_data_dir,
            '--enable-logging': '',
            '--v': str(int(os.environ.get("ODOO_BROWSER_LOG_VERBOSITY", "0"))),
            # FIXME: these next 2 flags are temporarily uncommented to allow client
            # code to manually run garbage collection. This is done as currently
            # the Chrome unit test process doesn't have access to its available
            # memory, so it cannot run the GC efficiently and may run out of memory
            # and crash. These should be re-commented when the process is correctly
            # configured.
            '--enable-precise-memory-info': '',
            '--js-flags': '--expose-gc',
        }
        if headless:
            switches.update(headless_switches)
        if touch_enabled:
            # enable Chrome's Touch mode, useful to detect touch capabilities using
            # "'ontouchstart' in window"
            switches['--touch-events'] = ''
        if debug is not False:
            switches['--auto-open-devtools-for-tabs'] = ''
            switches['--start-fullscreen'] = ''

        cmd = [self.executable]
        cmd += ['%s=%s' % (k, v) if v else k for k, v in switches.items()]
        url = 'about:blank'
        cmd.append(url)
        try:
            proc, devtools_port = self._spawn_chrome(cmd)
        except OSError:
            raise unittest.SkipTest("%s not found" % cmd[0])
        self._logger.info('Chrome pid: %s', proc.pid)
        self._logger.info('Chrome headless temporary user profile dir: %s', self.user_data_dir)
        try:
            yield proc, devtools_port
        finally:
            self._terminate(proc)

    def read_log(self) -> bytes:
        try:
            return pathlib.Path(self.user_data_dir, 'chrome_debug.log').read_bytes()
        except FileNotFoundError:
            return b''

    def _json_command(self, command, timeout=3):
        """Queries browser state using JSON

        Available commands:

        ``''``
            return list of tabs with their id
        ``list`` (or ``json/``)
            list tabs
        ``new``
            open a new tab
        :samp:`activate/{id}`
            activate a tab
        :samp:`close/{id}`
            close a tab
        ``version``
            get chrome and dev tools version
        ``protocol``
            get the full protocol
        """
        url = f'http://{HOST}:{self.devtools_port}/json/{command}'.rstrip('/')
        self._logger.info("Issuing json command %s", url)
        delay = 0.1
        tries = 0
        failure_info = None
        message = None
        while timeout > 0:
            if self.process.poll() is not None:
                message = 'Chrome crashed at startup'
                break
            try:
                r = requests.get(url, timeout=3)
                if r.ok:
                    return r.json()
            except requests.ConnectionError as e:
                failure_info = str(e)
                message = 'Connection Error while trying to connect to Chrome debugger'
            except requests.exceptions.ReadTimeout as e:
                failure_info = str(e)
                message = 'Connection Timeout while trying to connect to Chrome debugger'
                break

            time.sleep(delay)
            timeout -= delay
            delay = delay * 1.5
            tries += 1
        self._logger.error("%s after %s tries", message, tries)
        if failure_info:
            self._logger.info(failure_info)
        self.stop()
        raise unittest.SkipTest("Error during Chrome headless connection")

    @contextlib.contextmanager
    def _open_websocket(self):
        version = self._json_command('version')
        self._logger.info('Browser version: %s', version['Browser'])
        ws_url = version['webSocketDebuggerUrl']

        self._logger.info('Websocket url found: %s', ws_url)
        ws = websocket.create_connection(ws_url, enable_multithread=True, suppress_origin=True)
        if ws.getstatus() != 101:
            raise unittest.SkipTest("Cannot connect to chrome dev tools")
        ws.settimeout(0.01)
        try:
            yield ws
        finally:
            self._logger.info("Closing websocket connection")
            ws.close()


class FirefoxBrowser(Browser):
    """ Helper object to control a Firefox headless process.

    Firefox implements WebDriver BiDi natively, so it is used directly. CDP
    specific features (CPU throttling, screencasts, heap usage) are not
    available.
    """
    name = 'Firefox'
    log_prefix = 'firefox_log_'
    remote_debugging_port = 0  # change it in a non-git-tracked file

    preferences = {
        'browser.aboutwelcome.enabled': False,  # Skip the welcome screen
        'browser.sessionstore.resume_from_crash': False,  # Don't offer to restore the previous session
        'browser.shell.checkDefaultBrowser': False,  # Bypass the prompt asking to make Firefox the default browser
        'browser.startup.homepage_override.mstone': 'ignore',  # Skip the "what's new" page
        'browser.startup.page': 0,  # Start with a blank page
        'browser.tabs.warnOnClose': False,  # Don't ask for confirmation when closing tabs
        'browser.translations.enable': False,  # Disable Firefox translation
        'datareporting.policy.dataSubmissionEnabled': False,  # Disable telemetry and its first-run notice
        'dom.disable_open_during_load': False,  # Disable the popup blocker
        'dom.max_script_run_time': 0,  # Never show the slow script dialog
        'media.autoplay.blocking_policy': 0,  # Allow media autoplay without requiring a user click
        'media.autoplay.default': 0,
        'network.proxy.type': 0,  # Force a direct connection, bypassing any system proxies
        'signon.rememberSignons': False,  # Don't offer to save the passwords
    }

    @property
    def executable(self):
        try:
            return _find_firefox_executable()
        except Exception:
            self._logger.warning('Firefox executable not found')
            raise

    def _open_context(self):
        # in headless mode the initial tab never gets the focus, so focus
        # events aren't dispatched in it: the tests run in a new tab
        initial_context = super()._open_context()
        context = self._request('browsingContext.create', params={'type': 'tab'})['context']
        self._request('browsingContext.close', params={'context': initial_context})
        return context

    def _handle_log_entry(self, type, level, source, text=None, stackTrace=None, **kw):  # pylint: disable=redefined-builtin
        if type == 'javascript' and stackTrace is None:
            # Firefox also reports the errors which aren't script exceptions
            # (e.g. failed font downloads, CSS errors), without stack trace,
            # Chrome doesn't report them at all
            self._logger.getChild('browser').info("%s", text)
            return
        super()._handle_log_entry(type, level, source, text=text, stackTrace=stackTrace, **kw)

    @contextlib.contextmanager
    def _start(self, touch_enabled, headless=True, debug=False):
        preferences = dict(self.preferences)
        if touch_enabled:
            # expose touch events, notably "'ontouchstart' in window"
            preferences['dom.w3c_touch_events.enabled'] = 1
            preferences['dom.w3c_touch_events.legacy_apis.enabled'] = True
        pathlib.Path(self.user_data_dir, 'user.js').write_text(''.join(
            f'user_pref({json.dumps(name)}, {json.dumps(value)});\n'
            for name, value in preferences.items()
        ), encoding='utf-8')

        cmd = [
            self.executable,
            '--no-remote',
            '--profile', self.user_data_dir,
            '--remote-debugging-port', str(self.remote_debugging_port),
        ]
        if headless:
            cmd.append('--headless')
        if debug is not False:
            cmd.append('--devtools')
        cmd.append('about:blank')
        try:
            with pathlib.Path(self.user_data_dir, 'firefox.log').open('wb') as log:
                # pylint: disable=subprocess-popen-preexec-fn
                self.process = subprocess.Popen(
                    cmd,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    preexec_fn=_preexec,  # noqa: PLW1509
                    env={**os.environ, 'TMPDIR': self.user_data_dir, 'MOZ_CRASHREPORTER_DISABLE': '1'},
                )
        except OSError:
            raise unittest.SkipTest("%s not found" % cmd[0])
        self._logger.info('Firefox pid: %s', self.process.pid)
        self._logger.info('Firefox headless temporary profile dir: %s', self.user_data_dir)
        try:
            ws_url = self._wait_bidi_server()
            self._logger.info('Websocket url found: %s', ws_url)
            ws = websocket.create_connection(ws_url, enable_multithread=True, suppress_origin=True)
            ws.settimeout(0.01)
            try:
                yield BidiTransport(ws, self._logger)
            finally:
                self._logger.info("Closing websocket connection")
                ws.close()
        finally:
            self._terminate(self.process)

    def _wait_bidi_server(self) -> str:
        """ Returns the url of the BiDi endpoint, from the file Firefox writes
        in the profile once its server listens.
        """
        server_file = pathlib.Path(self.user_data_dir, 'WebDriverBiDiServer.json')
        for _ in range(CHECK_BROWSER_ITERATIONS):
            time.sleep(CHECK_BROWSER_SLEEP)
            if self.process.poll() is not None:
                break
            try:
                server = json.loads(server_file.read_text('utf-8'))
            except (FileNotFoundError, ValueError):
                continue
            return f"ws://{server['ws_host']}:{server['ws_port']}/session"

        self._logger.warning(
            'Firefox headless failed to start:\n%s',
            self.read_log().decode(errors='replace'),
        )
        raise unittest.SkipTest(f'Failed to detect the Firefox BiDi server after {BROWSER_WAIT:.1f}s.')

    def read_log(self) -> bytes:
        try:
            return pathlib.Path(self.user_data_dir, 'firefox.log').read_bytes()
        except FileNotFoundError:
            return b''


class NoScreencast:
    def start(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

    def save(self):
        pass


class Screencaster:
    """ Records the page using CDP's screencast, BiDi has no equivalent. """
    def __init__(self, browser: ChromeBrowser, directory: str):
        self.stopped = False
        self.browser: ChromeBrowser = browser
        self._logger: logging.Logger = browser._logger
        self.directory = pathlib.Path(directory, get_db_name(), 'screencasts')
        ts = datetime.now()
        self.frames_dir = self.directory / f'frames-{ts:%Y%m%dT%H%M%S.%f}'
        self.frames_dir.mkdir(parents=True, exist_ok=True)
        self.frames = []
        browser._handlers['goog:cdp.Page.screencastFrame'] = self._handle_frame

    def start(self):
        self._logger.info('Starting screencast')
        self.browser._request('session.subscribe', params={'events': ['goog:cdp.Page.screencastFrame']})
        self.browser._cdp_send('Page.startScreencast')

    def _handle_frame(self, params, **kw):
        self(**params)

    def __call__(self, sessionId, data, metadata):
        self.browser._cdp_send('Page.screencastFrameAck', {'sessionId': sessionId})
        if self.stopped:
            # if already stopped, drop the frames as we might have removed the directory already
            return
        outfile = self.frames_dir / f'frame_{len(self.frames):05d}.png'
        try:
            outfile.write_bytes(binascii.a2b_base64(data.encode()))
        except FileNotFoundError:
            return
        self.frames.append({
            'file_path': outfile,
            'timestamp': metadata.get('timestamp')
        })

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.browser._cdp_send('Page.stopScreencast')
        self.stopped = True
        if self.frames_dir.is_dir():
            shutil.rmtree(self.frames_dir, ignore_errors=True)

    def save(self):
        if self.stopped:
            return
        self.browser._cdp_send('Page.stopScreencast')
        # Wait for frames just in case, ideally we'd wait for the Browse.close
        # event or something but that doesn't exist.
        time.sleep(5)
        self.stopped = True
        if not self.frames:
            self._logger.debug('No screencast frames to encode')
            return

        frames, self.frames = self.frames, []
        t = time.time()
        duration = 1/24
        concat_script_path = self.frames_dir.with_suffix('.txt')
        with concat_script_path.open("w") as concat_file:
            for f, next_frame in zip_longest(frames, islice(frames, 1, None)):
                frame_file_path = f['file_path']

                if f['timestamp'] is not None:
                    end_time = next_frame['timestamp'] if next_frame else t
                    duration = end_time - f['timestamp']
                concat_file.write(f"file '{frame_file_path}'\nduration {duration}\n")
            concat_file.write(f"file '{frame_file_path}'")  # needed by the concat plugin

        try:
            ffmpeg_path = find_in_path('ffmpeg')
        except IOError:
            self._logger.runbot('Screencast frames in: %s', self.frames_dir)
            return

        outfile = self.frames_dir.with_suffix('.mp4')
        try:
            subprocess.run([
                ffmpeg_path,
                '-y', '-loglevel', 'warning',
                '-f', 'concat', '-safe', '0', '-i', concat_script_path,
                '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
                '-c:v', 'libx265', '-x265-params', 'lossless=1',
                outfile,
            ], preexec_fn=_preexec, check=True)
        except subprocess.CalledProcessError:
            self._logger.error('Failed to encode screencast, screencast frames in %s', self.frames_dir)
        else:
            concat_script_path.unlink()
            shutil.rmtree(self.frames_dir, ignore_errors=True)
            self._logger.runbot('Screencast in: %s', outfile)


@cache
def _read_bidi_mapper() -> str:
    """ Returns the source of chromium-bidi's mapper (``mapperTab.js``),
    which provides WebDriver BiDi on top of CDP for Chrome.

    The vendored version is used unless ``ODOO_BROWSER_BIDI_MAPPER`` points
    to another one, e.g. to match an older or newer Chrome.
    """
    path = os.environ.get('ODOO_BROWSER_BIDI_MAPPER') or pathlib.Path(__file__).with_name('lib') / 'chromium_bidi' / 'mapperTab.js'
    return pathlib.Path(path).read_text(encoding='utf-8')


@cache
def _browser_bin() -> tuple[str | None, bool]:
    """ Returns the browser executable set by ``ODOO_BROWSER_BIN``, if any,
    and whether it is Firefox (otherwise it is assumed to be Chrome).

    ``ODOO_BROWSER_BIN`` is used for testing specific browser builds, or
    another browser than Chrome.
    """
    browser_bin_path = os.environ.get('ODOO_BROWSER_BIN')
    if not (browser_bin_path and os.path.exists(browser_bin_path)):
        return None, False
    if platform.system() == 'Windows':
        # the browsers don't print their version on Windows
        return browser_bin_path, 'firefox' in pathlib.Path(browser_bin_path).name.lower()
    try:
        version = subprocess.run(
            [browser_bin_path, '--version'],
            capture_output=True, text=True, timeout=10, check=False,
        ).stdout
    except (OSError, subprocess.TimeoutExpired):
        version = ''
    return browser_bin_path, 'Firefox' in version


def _get_browser_class() -> type[Browser]:
    """ Returns the browser running the browser tests: Firefox if
    ``ODOO_BROWSER_BIN`` is a Firefox, Chrome otherwise.
    """
    return FirefoxBrowser if _browser_bin()[1] else ChromeBrowser


@cache
def _find_executable():
    browser_bin_path, is_firefox = _browser_bin()
    if browser_bin_path and not is_firefox:
        return browser_bin_path
    system = platform.system()
    if system == 'Linux':
        for bin_ in ['google-chrome', 'chromium', 'chromium-browser', 'google-chrome-stable']:
            try:
                return find_in_path(bin_)
            except IOError:
                continue

    elif system == 'Darwin':
        bins = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
        for bin_ in bins:
            if os.path.exists(bin_):
                return bin_

    elif system == 'Windows':
        bins = [
            '%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe',
            '%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe',
            '%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe',
        ]
        for bin_ in bins:
            bin_ = os.path.expandvars(bin_)
            if os.path.exists(bin_):
                return bin_

    raise unittest.SkipTest("Chrome executable not found")


@cache
def _find_firefox_executable():
    browser_bin_path, is_firefox = _browser_bin()
    if browser_bin_path and is_firefox:
        return browser_bin_path
    system = platform.system()
    if system == 'Linux':
        for bin_ in ['firefox', 'firefox-esr']:
            try:
                return find_in_path(bin_)
            except OSError:
                continue

    elif system == 'Darwin':
        bin_ = '/Applications/Firefox.app/Contents/MacOS/firefox'
        if os.path.exists(bin_):
            return bin_

    elif system == 'Windows':
        bins = [
            '%ProgramFiles%\\Mozilla Firefox\\firefox.exe',
            '%ProgramFiles(x86)%\\Mozilla Firefox\\firefox.exe',
        ]
        for bin_ in bins:
            bin_ = os.path.expandvars(bin_)
            if os.path.exists(bin_):
                return bin_

    raise unittest.SkipTest("Firefox executable not found")


class Opener(requests.Session):
    """
    Flushes and clears the current transaction when starting a request.

    This is likely necessary when we make a request to the server, as the
    request is made with a test cursor, which uses a different cache than this
    transaction.
    """
    def __init__(self, http_case: HttpCase):
        super().__init__()
        self.test_case = http_case
        self.cr = http_case.cr

    def request(self, *args, **kwargs):
        assert self.test_case.opener == self
        with flushing_cursor(self.cr), self.test_case.allow_requests():
            res = super().request(*args, **kwargs)
            res.__class__ = Response
            return res


class Response(requests.Response):
    @property
    def session(self) -> Session:
        """
        Get the session attached to the response.

        There are three cases:

        1. The session exists and was persisted on disk, you get the
           entire session and ``session.is_new`` is ``False``.
        2. The session exists but was not persisted on disk (because it
           only contained default values), you get an *empty* session
           but ``session.is_new`` is ``False``. This session is **not**
           populated with :func:`odoo.http.session.get_default_session`
           as the ``db`` and ``context['lang']`` cannot be set. Please
           adapt your test in this regard.
        3. The session doesn't exist, you get an empty session and
           ``session.is_new`` is ``True``.
        """
        session_id = (
            self.cookies.get('session_id')
            or self.request._cookies.get('session_id')
            or ''
        )
        return session_store().get(session_id, keep_sid=True)

    def raise_for_status(self) -> Response:
        try:
            super().raise_for_status()
        except requests.exceptions.HTTPError as exc:
            is_html = self.headers.get('content-type', '').startswith('text/html')
            is_website = is_html and b'<meta name="generator" content="Odoo"/>' in self.content
            if is_website:
                # The second container in <main> contains the error message
                main = self.text.partition('<main>')[2].partition('</main>')[0]
                c = '<div class="container">'
                error = main[main.find(c) + len(c):].partition(c)[2].partition('</div>')[0]
                exc.add_note(shorten(error, 150))
            elif is_html:
                exc.add_note(shorten(self.text.partition('</h1>')[2], 150))
            else:
                exc.add_note(shorten(self.text, 150))
            raise
        return self


class Transport(xmlrpclib.Transport):
    """ see :class:`Opener` """
    def __init__(self, http_case: HttpCase):
        self.test_case = http_case
        self.cr = http_case.cr
        super().__init__()

    def request(self, *args, **kwargs):
        with flushing_cursor(self.cr), self.test_case.allow_requests(all_requests=True):
            return super().request(*args, **kwargs)


class JsonRpcException(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class HttpCase(TransactionCase):
    """ Transactional HTTP TestCase with url_open and Chrome headless helpers. """
    browser = None
    browser_class: type[Browser] | None = None  # defaults to the ODOO_BROWSER_BIN one, see _get_browser_class
    browser_size = '1366x768'
    touch_enabled = False
    session: OdooHttpSession = None

    _logger: logging.Logger = None

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.enterClassContext(cls.registry_test_mode())

        ICP = cls.env['ir.config_parameter']
        ICP.set_str('web.base.url', cls.base_url())
        ICP.env.flush_all()
        # v8 api with correct xmlrpc exception handling.
        cls.xmlrpc_url = f'{cls.base_url()}/xmlrpc/2/'
        cls._logger = logging.getLogger('%s.%s' % (cls.__module__, cls.__name__))

    @classmethod
    def base_url(cls):
        return f"http://{HOST}:{cls.http_port():d}"

    @classmethod
    def http_port(cls):
        return config['http_port']

    def setUp(self):
        super().setUp()

        self._logger = self._logger.getChild(self._testMethodName)

        self.xmlrpc_common = xmlrpclib.ServerProxy(self.xmlrpc_url + 'common', transport=Transport(self))
        self.xmlrpc_db = xmlrpclib.ServerProxy(self.xmlrpc_url + 'db', transport=Transport(self))
        self.xmlrpc_object = xmlrpclib.ServerProxy(self.xmlrpc_url + 'object', transport=Transport(self), use_datetime=True)
        # setup an url opener helper
        self.opener = Opener(self)
        self.http_key_sequence = itertools.count()
        # we need to allow requests during pdf rendering.
        case_instance = self

        def _patched_run_wkhtmltopdf(self, args):
            http_request_key = case_instance.http_request_key
            with (
                release_test_lock(),
                patch('odoo.tests.common._disable_flushing_cursor', True),
            ):
                args = ['--cookie', TEST_CURSOR_COOKIE_NAME, http_request_key, *args]
                return old_run_wkhtmltopdf(self, args)

        report_model = self.env.registry['ir.actions.report']
        try:
            old_run_wkhtmltopdf = report_model._run_wkhtmltopdf
        except AttributeError:
            pass
        else:
            self.startPatcher(
                patch.object(report_model, '_run_wkhtmltopdf', _patched_run_wkhtmltopdf),
            )

    @contextmanager
    def allow_pdf_render(self):
        _logger.warning("HTTPCase does not require calling allow_pdf_render")
        yield

    @contextmanager
    def allow_requests(self, browser: Browser | None = None, all_requests=False):
        """
        Allows HTTP requests for the scope of the context.

        Params:
            browser (Browser | None): if given, add the cookie to the browser.
            all_requests (bool): if True, allows all requests regardless of cookie.
        """
        with ExitStack() as defer:
            defer.enter_context(release_test_lock())
            if all_requests:
                self.http_request_allow_all = True
            new_key = f'{self.canonical_tag}__{next(self.http_key_sequence)}'
            defer.enter_context(patch.object(self, 'http_request_key', new_key))
            old_cookie = self.opener.cookies.get(TEST_CURSOR_COOKIE_NAME)
            if old_cookie:
                defer.callback(self.opener.cookies.set, TEST_CURSOR_COOKIE_NAME, old_cookie)
            else:
                defer.callback(self.opener.cookies.pop, TEST_CURSOR_COOKIE_NAME, None)
            self.opener.cookies[TEST_CURSOR_COOKIE_NAME] = new_key
            if browser:
                browser.set_cookie(
                    TEST_CURSOR_COOKIE_NAME, self.http_request_key, '/', HOST,
                )
            yield

    def parse_http_location(self, location):
        """ Parse a Location http header typically found in 201/3xx
        responses, return the corresponding parsed url object. The scheme/host
        are taken from ``base_url()`` in case they are missing from the
        header.
        """
        if not location:
            return urlsplit('')
        s = urlsplit(urljoin(self.base_url(), location))
        # normalise query parameters
        return s._replace(query=urlencode(parse_qsl(s.query)))

    def assertURLEqual(self, test_url, truth_url, message=None):
        """ Assert that two URLs are equivalent. If any URL is missing
        a scheme and/or host, assume the same scheme/host as base_url()
        """
        self.assertEqual(
            self.parse_http_location(test_url),
            self.parse_http_location(truth_url),
            message,
        )

    def build_rpc_payload(self, params=None):
        """
        Helper to properly build jsonrpc payload
        """
        return {
            "jsonrpc": "2.0",
            "method": "call",
            "id": str(uuid4()),
            "params": params or {},
        }

    def csrf_token(self):
        return Request.csrf_token(self)  # noqa: F821

    def url_open(self, url, data=None, files=None, timeout=12, headers=None, json=None, params=None, allow_redirects=True, cookies=None, method: str | None = None):
        if DISABLE_TIMEOUTS:
            timeout = None
        if not method and (data or files or json):
            method = 'POST'
        method = method or 'GET'
        if url.startswith('/'):
            url = self.base_url() + url
        return self.opener.request(method, url, params=params, data=data, json=json, files=files, timeout=timeout, headers=headers, cookies=cookies, allow_redirects=allow_redirects)

    def _wait_remaining_requests(self, timeout=10):

        def get_http_request_threads():
            return [
                t for t in threading.enumerate()
                if t.name.startswith('odoo.service.http.request')
                if getattr(t, 'processing_http', False)
            ]

        end_time = real_time() + timeout
        request_threads = get_http_request_threads()
        if not request_threads:
            return

        self._logger.info('waiting for threads: %s', request_threads)

        while real_time() < end_time:
            time.sleep(0.1)

        request_threads = get_http_request_threads()
        for thread in request_threads:
            self._logger.info("Stop waiting for thread %s handling request for url %s",
                                    thread.name, getattr(thread, 'url', '<UNKNOWN>'))

        if request_threads:
            self._logger.info('remaining requests')
            odoo.tools.misc.dumpstacks()

    def logout(self, keep_db=True):
        logout(self.session, keep_db=keep_db)
        session_store().save(self.session)

    def update_session(self, **items):
        self.session.update(**items)
        session_store().save(self.session)

    def update_session_context(self, **items):
        self.session['context'].update(**items)
        session_store().save(self.session)

    def authenticate(self, user, password, *, browser: Browser | None = None, session_extra=()):
        if getattr(self, 'session', None):
            session_store().delete(self.session)

        self.session = session_store().new()
        self.session.update(
            get_default_session(),
            db=get_db_name(),
            _trace_disable=True,  # saves a query on all requests
        )
        self.session.context['lang'] = DEFAULT_LANG
        self.session.context['host_id'] = self.env['ir.http']._get_host_id_from_domain(self.base_url())

        if session_extra:
            if extra_ctx := session_extra.pop('context', None):
                self.session.context.update(extra_ctx)
            self.session.update(session_extra)

        if user: # if authenticated
            # Flush and clear the current transaction.  This is useful, because
            # the call below opens a test cursor, which uses a different cache
            # than this transaction.
            # In the context of a browser, the flush is already done.
            flushing = flushing_cursor(self.cr) if browser is None else contextlib.nullcontext()

            def patched_check_credentials(self, credential, env):
                return {'uid': self.id, 'auth_method': 'password', 'mfa': 'default'}

            # patching to speedup the check in case the password is hashed with many hashround + avoid to update the password
            with flushing, patch('odoo.addons.base.models.res_users.ResUsersPatchedInTest._check_credentials', new=patched_check_credentials):
                credential = {'login': user, 'password': password, 'type': 'password'}
                auth_info = self.env(context=self.session.context)['res.users'].authenticate(credential, {'interactive': False})
            uid = auth_info['uid']
            env = api.Environment(self.cr, uid, {})
            self.session['uid'] = uid
            self.session['login'] = user
            self.session['session_token'] = None
            if uid:
                update_session_token(self.session, env)
            self.session['context'] = dict(env['res.users'].context_get())
            if session_extra and (ctx := session_extra.get('context')):
                self.session['context'].update(ctx)

        session_store().save(self.session)
        # Reset the opener: turns out when we set cookies['foo'] we're really
        # setting a cookie on domain='' path='/'.
        #
        # But then our friendly neighborhood server might set a cookie for
        # domain='localhost' path='/' (with the same value) which is considered
        # a *different* cookie following ours rather than the same.
        #
        # When we update our cookie, it's done in-place, so the server-set
        # cookie is still present and (as it follows ours and is more precise)
        # very likely to still be used, therefore our session change is ignored.
        #
        # An alternative would be to set the cookie to None (unsetting it
        # completely) or clear-ing session.cookies.
        self.opener = Opener(self)
        self.opener.cookies.set("session_id", self.session.sid, domain=HOST)
        if browser:
            self._logger.info('Setting session cookie in browser')
            browser.set_cookie('session_id', self.session.sid, '/', HOST)

        return self.session

    def fetch_proxy(self, url):
        """
            This method is called every time a request is made from the chrome browser outside the local network
            Returns a response that will be sent to the browser to simulate the external request.
        """

        if 'https://fonts.googleapis.com/css' in url:
            _logger.info('External chrome request during tests: Return empty file for %s', url)
            return self.make_fetch_proxy_response('')  # return empty css file, we don't care

        _logger.info('External chrome request during tests: returning 404 for %s', url)
        return {
                'body': '',
                'responseCode': 404,
                'responseHeaders': [],
            }

    def make_fetch_proxy_response(self, content, code=200):
        if isinstance(content, str):
            content = content.encode()
        return {
                'body': base64.b64encode(content).decode(),
                'responseCode': code,
                'responseHeaders': [
                    {'name': 'access-control-allow-origin', 'value': '*'},
                    {'name': 'cache-control', 'value': 'public, max-age=10000'},
                ],
            }

    def browser_js(self, url_path, code, ready='', login=None, timeout=60, cookies=None, error_checker=None, watch=False, success_signal=DEFAULT_SUCCESS_SIGNAL, debug=False, cpu_throttling=None, **kw):
        """ Test JavaScript code running in the browser.

        To signal success test do: `console.log()` with the expected `success_signal`. Default is "test successful"
        To signal test failure raise an exception or call `console.error` with a message.
        Test will stop when a failure occurs if `error_checker` is not defined or returns `True` for this message

        :param string url_path: URL path to load the browser page on
        :param string code: JavaScript code to be executed
        :param string ready: JavaScript object to wait for before proceeding with the test
        :param string login: logged in user which will execute the test. e.g. 'admin', 'demo'
        :param int timeout: maximum time to wait for the test to complete (in seconds). Default is 60 seconds
        :param dict cookies: dictionary of cookies to set before loading the page
        :param error_checker: function to filter failures out.
            If provided, the function is called with the error log message, and if it returns `False` the log is ignored and the test continue
            If not provided, every error log triggers a failure
        :param bool watch: open a new browser window to watch the test execution
        :param string success_signal: string signal to wait for to consider the test successful
        :param bool debug: automatically open a fullscreen Chrome window with opened devtools and a debugger breakpoint set at the start of the tour.
            The tour is ran with the `debug=assets` query parameter. When an error is thrown, the debugger stops on the exception.
        :param int cpu_throttling: CPU throttling rate as a slowdown factor (1 is no throttle, 2 is 2x slowdown, etc)
        """
        if not self.env.registry.loaded:
            self._logger.warning('HttpCase test should be in post_install only')

        # increase timeout if coverage is running
        if any(f.filename.endswith('/coverage/execfile.py') for f in inspect.stack()  if f.filename):
            timeout = timeout * 1.5

        if debug is not False:
            watch = True
            timeout = 1e6
        elif DISABLE_TIMEOUTS:
            timeout = 1e6
        if watch:
            self._logger.warning('watch mode is only suitable for local testing')

        browser_class = self.browser_class or _get_browser_class()
        browser = browser_class(self, headless=not watch, success_signal=success_signal, debug=debug)
        with self.allow_requests(browser=browser), contextlib.ExitStack() as atexit:
            # Flush and clear the current transaction.  This is useful in case
            # we make requests to the server, as these requests are made with
            # test cursors, which uses different caches than this transaction.
            # Wait for all request before resetting the cursor.
            atexit.enter_context(flushing_cursor(self.cr))
            atexit.callback(self._wait_remaining_requests)
            atexit.enter_context(browser.cleanup)
            if "bus.bus" in self.env.registry:
                from odoo.addons.base.models.ir_http import IrHttp  # noqa: PLC0415
                from odoo.addons.bus.websocket import CloseCode, WebsocketConnectionHandler, _kick_all  # noqa: PLC0415

                atexit.callback(_kick_all, CloseCode.KILL_NOW)
                original_post_dispatch = IrHttp._post_dispatch

                def post_dispatch_wrapper(_, response):
                    original_post_dispatch(response)
                    # Trigger the creation of bus.bus records and notification dispatching
                    request.env.cr.precommit.run()
                    request.env.cr.postcommit.run()

                atexit.enter_context(patch.object(IrHttp, "_post_dispatch", classmethod(post_dispatch_wrapper)))
                atexit.enter_context(patch.object(
                    WebsocketConnectionHandler, "websocket_allowed", return_value=True
                ))

            self.authenticate(login, login, browser=browser)
            url = urljoin(self.base_url(), url_path)
            if watch:
                parsed = urlsplit(url)
                qs = dict(parse_qsl(parsed.query))
                qs['watch'] = '1'
                if debug is not False:
                    qs['debug'] = "assets"
                url = urlunsplit(parsed._replace(query=urlencode(qs)))
            self._logger.info('Open "%s" in browser', url)

            browser.screencaster.start()
            if cookies:
                for name, value in cookies.items():
                    browser.set_cookie(name, value, '/', HOST)

            cpu_throttling_os = os.environ.get('ODOO_BROWSER_CPU_THROTTLING')  # used by dedicated runbot builds
            cpu_throttling = int(cpu_throttling_os) if cpu_throttling_os else cpu_throttling

            if cpu_throttling:
                _logger.log(
                    logging.INFO if cpu_throttling_os else logging.WARNING,
                    'CPU throttling mode is only suitable for local testing - '
                    'Throttling browser CPU to %sx slowdown and extending timeout to %s sec', cpu_throttling, timeout)
                browser.throttle(cpu_throttling)

            browser.navigate_to(url, wait_stop=not bool(ready))

            # Needed because tests like test01.js (qunit tests) are passing a ready
            # code = ""
            self.assertTrue(browser._wait_ready(ready), 'The ready "%s" code was always falsy' % ready)

            error = None
            try:
                browser._wait_code_ok(code, timeout, error_checker=error_checker)
            except BrowserException as browser_exception:
                error = browser_exception
            if error:  # dont keep initial traceback, keep that outside of except
                self.fail(str(error))

    def start_tour(self, url_path, tour_name, step_delay=None, **kwargs):
        """Wrapper for `browser_js` to start the given `tour_name` with the
        optional delay between steps `step_delay`. Other arguments from
        `browser_js` can be passed as keyword arguments."""
        options = {
            'stepDelay': step_delay or 0,
            'debug': kwargs.get('debug', False),
        }
        code = kwargs.pop('code', f"odoo.startTour({tour_name!r}, {json.dumps(options)})")
        ready = kwargs.pop('ready', f"odoo.isTourReady({tour_name!r})")
        timeout = kwargs.pop('timeout', 60)

        if step_delay is not None:
            self._logger.warning('step_delay is only suitable for local testing')
        Users = self.registry['res.users']

        def _post_model_setup__(model):
            super(Users, model)._post_model_setup__()
            Users.tour_enabled = False

        with patch.object(Users, 'tour_enabled', False),\
                patch.object(Users, '_post_model_setup__', _post_model_setup__),\
                patch.object(Users, '_compute_tour_enabled', lambda _: None):
            self.browser_js(url_path=url_path, code=code, ready=ready, timeout=timeout, success_signal="tour succeeded", **kwargs)

    def profile(self, **kwargs):
        """
        for http_case, also patch _get_profiler_context_manager in order to profile all requests
        """
        sup = super()
        _profiler = sup.profile(**kwargs)
        def route_profiler(request):
            _route_profiler = sup.profile(description=request.httprequest.full_path, db=_profiler.db)
            _profiler.sub_profilers.append(_route_profiler)
            return _route_profiler
        return profiler.Nested(_profiler, patch('odoo.http.router._get_profiler_context_manager', route_profiler))

    def get_method_additional_tags(self, test_method):
        """
        guess if the test_methods is a tour and adds an `is_tour` tag on the test
        """
        additional_tags = super().get_method_additional_tags(test_method)
        if odoo.tools.config['test_tags'] and 'is_tour' in odoo.tools.config['test_tags']:
            method_source = inspect.getsource(test_method)
            if 'self.start_tour' in method_source:
                additional_tags.append('is_tour')
        return additional_tags

    def make_jsonrpc_request(self, route, params=None, headers=None, cookies=None, timeout=12):
        """Make a JSON-RPC request to the server.

        :raises requests.HTTPError: if one occurred
        :raises JsonRpcException: if the response contains an error
        """
        if DISABLE_TIMEOUTS:
            timeout = None
        response = self.opener.post(urljoin(self.base_url(), route), json={
            'id': 0,
            'jsonrpc': '2.0',
            'method': 'call',
            'params': params or {},
        }, headers=headers, cookies=cookies, timeout=timeout)
        response.raise_for_status()
        decoded_response = response.json()
        if 'error' in decoded_response:
            raise JsonRpcException(
                code=decoded_response['error']['code'],
                message=decoded_response['error']['data']['name'],
            )
        return decoded_response['result']


def no_retry(arg):
    """Disable auto retry on decorated test method or test class"""
    arg._retry = False
    return arg


def users(*logins):
    """ Decorate a method to execute it once for each given user. """
    assert logins, "Expecting at least one login to execute"

    def users_decorator(func, /):
        @wraps(func)
        def with_users(self, *args, **kwargs):
            old_uid = self.uid
            try:
                # retrieve users
                Users = self.env['res.users'].with_context(active_test=False)
                user_id = {
                    user.login: user.id
                    for user in Users.search_fetch(
                        [('login', 'in', list(logins))],
                        ['login'], order='login',
                    )
                }
                for login in logins:
                    with self.subTest(login=login):
                        # switch user and execute func
                        self.uid = user_id[login]
                        func(self, *args, **kwargs)
                        self.env.flush_all()
                    # Invalidate the cache between subtests, in order to not reuse
                    # the former user's cache (`test_read_mail`, `test_write_mail`)
                    self.env.invalidate_all()
            finally:
                self.uid = old_uid

        return with_users
    return users_decorator


def warmup(func, /):
    """
    Stabilize assertQueries and assertQueryCount assertions.

    Reset the cache to a stable state by flushing pending changes and
    invalidating the cache.

    Warmup the ormcaches by running the decorated function an extra time
    before the actual test runs. The extra execution ignores
    assertQueries and assertQueryCount assertions, it also discardes all
    changes but the ormcaches ones.
    """
    @wraps(func)
    def warmup(self, *args, **kwargs):
        self.env.flush_all()
        self.env.invalidate_all()
        # run once to warm up the caches
        self.warm = False
        with contextlib.closing(self.cr.savepoint(flush=False)):
            func(self, *args, **kwargs)
            self.env.flush_all()
        # run once for real
        self.env.invalidate_all()
        self.warm = True
        func(self, *args, **kwargs)
    return warmup


def can_import(module):
    """ Checks if <module> can be imported, returns ``True`` if it can be,
    ``False`` otherwise.

    To use with ``unittest.skipUnless`` for tests conditional on *optional*
    dependencies, which may or may be present but must still be tested if
    possible.
    """
    try:
        importlib.import_module(module)
    except ImportError:
        return False
    else:
        return True


def tagged(*tags):
    """A decorator to tag BaseCase objects.

    Tags are stored in a set that can be accessed from a 'test_tags' attribute.

    A tag prefixed by '-' will remove the tag e.g. to remove the 'standard' tag.

    By default, all Test classes from odoo.tests.common have a test_tags
    attribute that defaults to 'standard' and 'post_install'.

    When using class inheritance, the tags ARE inherited.
    """
    include = {t for t in tags if not t.startswith('-')}
    exclude = {t[1:] for t in tags if t.startswith('-')}

    def tags_decorator(obj):
        obj.test_tags = (getattr(obj, 'test_tags', set()) | include) - exclude
        at_install = 'at_install' in obj.test_tags
        post_install = 'post_install' in obj.test_tags
        if not (at_install ^ post_install):
            _logger.warning('A tests should be either at_install or post_install, which is not the case of %r', obj)
        return obj
    return tags_decorator


class freeze_time:
    """ Object to replace the freezegun in Odoo test suites
        It properly handles the test classes decoration
        Also, it can be used like the usual method decorator or context manager
    """
    _freeze_time = staticmethod(freezegun.freeze_time)

    def __init__(self, time_to_freeze=None, tz_offset=0, tick=False, as_kwarg='', auto_tick_seconds=0):
        self.freezer = self._freeze_time(
            time_to_freeze=time_to_freeze,
            tz_offset=tz_offset,
            tick=tick,
            as_kwarg=as_kwarg,
            auto_tick_seconds=auto_tick_seconds,
        )

    def __call__(self, arg):
        if isinstance(arg, type) and issubclass(arg, case.TestCase):
            arg.freeze_time = self
            return arg

        return self.freezer(arg)

    def __enter__(self):
        return self.freezer.start()

    def __exit__(self, *args):
        self.freezer.stop()

    start = __enter__
    stop = __exit__


freezegun.freeze_time = freeze_time

safe_whitelist.add_class('freezegun.api.FakeDate')
safe_whitelist.add_class('freezegun.api.FakeDatetime')
safe_whitelist.add_function('FakeDate.*')
safe_whitelist.add_function('FakeDatetime.*')
safe_whitelist.add_instance('odoo.sql_db.TestCursor')
safe_whitelist.add_instance('odoo.tests.*')
safe_whitelist.add_instance('unittest.mock.MagicMock')
safe_whitelist.add_instance('unittest.mock.Mock')
