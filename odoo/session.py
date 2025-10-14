"""
Session classes:
- FileSession (Session)
- TemporaryFileSession
- MemorySession

Hook:
- odoo.http.root.session_cls

Perform IO operations for the session itself (must be patched):
- `exist`
- `init`
- `save`
- `delete`

Perform IO operations in general (must be patched):
- `vacuum`
- `get_missing_session_identifiers`
- `delete_from_identifiers`

----- Testing -----

```py
class Test:

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # cls.classPatch(odoo.http.Application, 'session_cls', odoo.session.TemporaryFileSession)
        cls.classPatch(odoo.http.Application, 'session_cls', odoo.session.MemorySession)

    def setUp(self):
        super().setUp()
        odoo.http.root.session_cls.cleanup()
```
"""

import contextlib
import functools
import glob
import inspect
import json
import logging
import os
import re
import secrets
import tempfile
import time

from collections.abc import MutableMapping
from datetime import datetime
from weakref import WeakValueDictionary

import odoo

from .http import DEFAULT_LANG, SESSION_LIFETIME, request
from .service import security
from .tools import classproperty, get_lang

_logger = logging.getLogger(__name__)

# The amount of bytes of the session that will remain static and can be used
# for calculating the csrf token and be stored inside the database.
STORED_SESSION_BYTES = 42

# After a session is rotated, the session should be kept for a couple of
# seconds to account for network delay between multiple requests which are
# made at the same time and all use the same old cookie.
SESSION_DELETION_TIMER = 120

# TODO: remove `84` length when v18.4 is deprecated
# This will invalidate sessions generated with the old sid generator
_base64_urlsafe_re = re.compile(r'^[A-Za-z0-9_-]{84,86}$')
_session_identifier_re = re.compile(r'^[A-Za-z0-9_-]{42}$')


class FileSession(MutableMapping):
    """
    Data structure that represents a file on the filesystem.
    This data is therefore persistent across requests.
    """
    __slots__ = (
        '_data__',
        '_is_new__',
        '_sid__',
        'can_save',
        'is_dirty',
        'should_rotate',
    )

    @staticmethod
    def get_default():
        return {
            'create_time': time.time(),
            'context': {},  # 'lang': request.default_lang()  # must be set at runtime
            'db': None,
            'debug': '',
            'login': None,
            'uid': None,
            'session_token': None,
            '_trace': [],
        }

    @classproperty
    @functools.lru_cache(maxsize=1)
    def path(cls):
        path = odoo.tools.config.session_dir
        os.makedirs(path, exist_ok=True)
        _logger.debug('HTTP sessions stored in: %s', path)
        return path

    def cleanup(self):
        raise NotImplementedError

    @staticmethod
    def new_sid():
        """ Generate a 86-chars long token with 64 bytes of entropy. """
        # To be secure, random token must have at least 256 bits (32 bytes) of entropy.
        # Here we decide the use a token of 512 bits (2x32 bytes). The session (and
        # cookie) will use the full 64-bytes long token. We will also store the first 32
        # bytes in the `res.device.log` model. In case the `res.device.log` model gets
        # compromised (e.g. data breach), pirates will not be able to exploit the
        # session token because they will lack the remaining 32 bytes.
        return secrets.token_urlsafe(64)

    def __fspath__(self):
        # scatter sessions across 4096 (64^2) directories
        return os.path.join(self.path, self.sid[:2], self.sid)

    def exist(self):
        return os.path.exists(self)

    def __init__(self, sid='', keep_sid=False, data=None, **kw):
        self._data__ = self.get_default()
        if not _base64_urlsafe_re.fullmatch(sid):
            self._sid__ = self.new_sid()
            self._is_new__ = True
        else:
            self._sid__ = sid
            self._is_new__ = False
            try:  # Try to load data from filesystem
                self.init()
            except FileNotFoundError:
                if not keep_sid:
                    self._sid__ = self.new_sid()
                    self._is_new__ = True

        self.can_save = True
        self.is_dirty = False
        self.should_rotate = False

        if data or kw:
            self.update(data or {}, **kw)

    def init(self) -> None:
        try:
            with open(self, encoding='utf-8') as f, contextlib.suppress(ValueError):
                self._data__.update(json.load(f))
        except OSError:
            raise FileNotFoundError

    def save(self) -> None:
        # Perform an atomic save
        # Create session in a transaction file in the
        # root directory of file session store
        fd, tmp = tempfile.mkstemp(suffix='.__tx_sess__', dir=self.path)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(dict(self), f)
        # Move the transaction file to the correct sub directory
        with contextlib.suppress(OSError):
            try:
                os.replace(tmp, self)
            except FileNotFoundError:
                # Ensure directory then retry
                session_dir = os.path.dirname(self)
                os.mkdir(session_dir, mode=0o755)
                os.replace(tmp, self)
            os.chmod(self, 0o644)

    def delete(self) -> None:
        with contextlib.suppress(OSError):
            os.unlink(self)

    def __getitem__(self, item):
        return self._data__[item]

    def __setitem__(self, item, value):
        value = json.loads(json.dumps(value))
        self.is_dirty |= (item not in self._data__) or (self._data__[item] != value)
        self._data__[item] = value

    def __delitem__(self, item):
        del self._data__[item]
        self.is_dirty = True

    def __len__(self):
        return len(self._data__)

    def __iter__(self):
        return iter(self._data__)

    def _make_session_property(key):
        return property(
            fget=lambda self: self.get(key),
            fset=lambda self, val: self.__setitem__(key, val),
        )

    sid = property(lambda self: self._sid__)
    static_sid = property(lambda self: self._sid__[:STORED_SESSION_BYTES])
    dynamic_sid = property(lambda self: self._sid__[STORED_SESSION_BYTES:])
    is_new = property(lambda self: self._is_new__)
    uid = _make_session_property('uid')
    db = _make_session_property('db')
    login = _make_session_property('login')
    context = _make_session_property('context')
    debug = _make_session_property('debug')
    session_token = _make_session_property('session_token')

    #
    # Session methods
    #
    def authenticate(self, env, credential):
        """
        Authenticate the current user with the given db, login and
        credential. If successful, store the authentication parameters in
        the current session, unless multi-factor-auth (MFA) is
        activated. In that case, that last part will be done by
        :ref:`finalize`.

        .. versionchanged:: saas-15.3
           The current request is no longer updated using the user and
           context of the session when the authentication is done using
           a database different than request.db. It is up to the caller
           to open a new cursor/registry/env on the given database.
        """
        wsgienv = {
            'interactive': True,
            'base_location': request.httprequest.url_root.rstrip('/'),
            'HTTP_HOST': request.httprequest.environ['HTTP_HOST'],
            'REMOTE_ADDR': request.httprequest.environ['REMOTE_ADDR'],
        }
        env = env(user=None, su=False)
        auth_info = env['res.users'].authenticate(credential, wsgienv)
        pre_uid = auth_info['uid']

        self.uid = None
        self['pre_login'] = credential['login']
        self['pre_uid'] = pre_uid

        env = env(user=pre_uid)

        # if 2FA is disabled we finalize immediately
        user = env['res.users'].browse(pre_uid)
        if auth_info.get('mfa') == 'skip' or not user._mfa_url():
            self.finalize(env)

        if request and request.session is self and request.db == env.registry.db_name:
            request.env = env(user=self.uid, context=self.context)
            request.update_context(lang=get_lang(request.env(user=pre_uid)).code)

        return auth_info

    def finalize(self, env):
        """
        Finalizes a partial session, should be called on MFA validation
        to convert a partial / pre-session into a logged-in one.
        """
        login = self.pop('pre_login')
        uid = self.pop('pre_uid')

        env = env(user=uid)
        user_context = dict(env['res.users'].context_get())

        self.should_rotate = True
        self.update({
            'db': env.registry.db_name,
            'login': login,
            'uid': uid,
            'context': user_context,
            'session_token': env.user._compute_session_token(self.sid),
        })

    def logout(self, keep_db=False):
        db = self.db if keep_db else self.get_default()['db']
        debug = self.debug
        self.clear()
        self.update(self.get_default(), db=db, debug=debug)
        self.context['lang'] = request.default_lang() if request else DEFAULT_LANG
        self.should_rotate = True

        if request and request.env:
            request.env['ir.http']._post_logout()

    def touch(self):
        self.is_dirty = True

    def update_trace(self, request):
        """
            :return: dict if a device log has to be inserted, ``None`` otherwise
        """
        if self.get('_trace_disable'):
            # To avoid generating useless logs, e.g. for automated technical sessions,
            # a session can be flagged with `_trace_disable`. This should never be done
            # without a proper assessment of the consequences for auditability.
            # Non-admin users have no direct or indirect way to set this flag, so it can't
            # be abused by unprivileged users. Such sessions will of course still be
            # subject to all other auditing mechanisms (server logs, web proxy logs,
            # metadata tracking on modified records, etc.)
            return None

        user_agent = request.httprequest.user_agent
        platform = user_agent.platform
        browser = user_agent.browser
        ip_address = request.httprequest.remote_addr
        now = int(datetime.now().timestamp())
        for trace in self['_trace']:
            if trace['platform'] == platform and trace['browser'] == browser and trace['ip_address'] == ip_address:
                # If the device logs are not up to date (i.e. not updated for one hour or more)
                if bool(now - trace['last_activity'] >= 3600):
                    trace['last_activity'] = now
                    self.is_dirty = True
                    return trace
                return None
        new_trace = {
            'platform': platform,
            'browser': browser,
            'ip_address': ip_address,
            'first_activity': now,
            'last_activity': now,
        }
        self['_trace'].append(new_trace)
        self.is_dirty = True
        return new_trace

    def rotate(self, env, *, soft=False):
        """
        Rotate the session sid.

        With a soft rotation, things like the CSRF token will still work. It's
        used for rotating the session in a way that half the bytes remain to
        identify the user and the other half to authenticate the user.

        Meanwhile with a hard rotation the entire session id is changed, which
        is useful in cases such as logging the user out.
        """
        # Rotate works inplace on the session instance
        if not soft:  # Hard rotation
            self.delete()
            self._sid__ = self.new_sid()
        else:
            # Multiple network requests can occur at the same time, all using the old session.
            # We don't want to create a new session for each request, it's better to reference the one already made.
            if next_sid := self.__class__(self.sid).get('next_sid'):
                # A new session has already been saved on disk by a concurrent request,
                # the _save_session is going to simply use session.sid to set a new cookie.
                self._sid__ = next_sid
                return
            next_sid = self.static_sid + self.__class__().dynamic_sid
            self['next_sid'] = next_sid
            self['deletion_time'] = time.time() + SESSION_DELETION_TIMER
            self.save()  # Concurrent requests will see these information
            # Now prepare the new session
            self['gc_previous_sessions'] = True
            self._sid__ = next_sid
            del self['deletion_time']
            del self['next_sid']

        if self.uid and env:
            self.session_token = security.compute_session_token(self, env)
        self.should_rotate = False
        self['create_time'] = time.time()
        self.save()

    @classmethod
    def vacuum(cls, max_lifetime=SESSION_LIFETIME):
        """ Remove expired session files older than the given lifetime. """
        threshold = time.time() - max_lifetime
        for fname in glob.iglob(os.path.join(cls.path, '*', '*')):
            path = os.path.join(cls.path, fname)
            with contextlib.suppress(OSError):
                if os.path.getmtime(path) < threshold:
                    os.unlink(path)

    @classmethod
    def get_missing_session_identifiers(cls, identifiers):
        """
        :param identifiers: session identifiers whose file existence must be checked
                            identifiers are a part session sid (first 42 chars)
        :type identifiers: iterable
        :return: the identifiers which are not present on the filesystem
        :rtype: set

        Note 1:
        Working with identifiers 42 characters long means that
        we don't have to work with the entire sid session,
        while maintaining sufficient entropy to avoid collisions.
        See details in ``generate_key``.

        Note 2:
        Scans the session store for inactive (GC'd) sessions.
        Works even if GC is done externally (not via ``vacuum()``).
        Performance is acceptable for an infrequent background job:
            - listing ``directories``: 1-5s on SSD
            - iterating sessions:
                - 25k on standard SSD: ~1.5 min
                - 2M on RAID10 SSD: ~25s
        """
        # There are a lot of session files.
        # Use the param ``identifiers`` to select the necessary directories.
        # In the worst case, we have 4096 directories (64^2).
        identifiers = set(identifiers)
        directories = {
            os.path.normpath(os.path.join(cls.path, identifier[:2]))
            for identifier in identifiers
        }
        # Remove the identifiers for which a file is present on the filesystem.
        for directory in directories:
            with contextlib.suppress(OSError), os.scandir(directory) as session_files:
                identifiers.difference_update(sf.name[:STORED_SESSION_BYTES] for sf in session_files)
        return identifiers

    @classmethod
    def delete_from_identifiers(cls, identifiers):
        """ Delete session files matching identifiers within the session store. """
        files_to_unlink = []
        for identifier in identifiers:
            # Avoid to remove a session if it does not match an identifier.
            # This prevent malicious user to delete sessions from a different
            # database by specifying a custom ``res.device.log``.
            if not _session_identifier_re.match(identifier):
                continue
            normalized_path = os.path.normpath(os.path.join(cls.path, identifier[:2], identifier + '*'))
            if normalized_path.startswith(cls.path):
                files_to_unlink.extend(glob.glob(normalized_path))
        for fn in files_to_unlink:
            with contextlib.suppress(OSError):
                os.unlink(fn)

    def _delete_old_sessions(self):
        """ Delete old sessions based on expiration and cleanup flag value. """
        if 'gc_previous_sessions' in self:
            if self['create_time'] + SESSION_DELETION_TIMER < time.time():
                self.delete_from_identifiers([self.static_sid])
                del self['gc_previous_sessions']
                self.save()


class TemporaryFileSession(FileSession):

    __slots__ = ()

    @classproperty
    @functools.lru_cache(maxsize=1)
    def path(cls):
        cls.tmpdir = tempfile.TemporaryDirectory()
        path = os.path.join(cls.tmpdir.name, 'odoo_session')
        os.makedirs(path, exist_ok=True)
        _logger.debug('HTTP sessions stored in: %s', path)
        return path

    @classmethod
    def cleanup(cls):
        if not hasattr(cls, 'tmpdir'):
            return
        cls.tmpdir.cleanup()
        # Clear the cached classproperty
        descriptor = dict(inspect.getmembers_static(cls))['path']
        descriptor.fget.__func__.cache_clear()


class MemorySession(FileSession):

    __slots__ = ()

    __store = {}
    __instances = {}

    path = ':memory:'

    @classmethod
    def cleanup(cls):
        cls.__store.clear()

    def exist(self):
        return os.fspath(self) in self.__store

    # Hack to reuse the same instance of Session. It is very useful during testing.
    # ```py
    # session = self.authenticate(..., ...)
    # self.url_open(...)  # Update session with `foo = 1`
    # session['foo']  # Works
    # ```
    def __new__(cls, sid='', *args, **kwargs):
        try:
            instance = cls.__instances[sid]
            instance._data__.clear()
        except KeyError:
            instance = super().__new__(cls)
        return instance

    def init(self) -> None:
        try:
            self._data__.update(self.__store[os.fspath(self)])
        except KeyError:
            raise FileNotFoundError

    def save(self) -> None:
        self.__store[os.fspath(self)] = dict(self)
        self.__instances[self.sid] = self

    def delete(self) -> None:
        with contextlib.suppress(KeyError):
            del self.__store[os.fspath(self)]
            del self.__instances[self.sid]

    @classmethod
    def vacuum(cls):
        return

    @classmethod
    def get_missing_session_identifiers(cls, identifiers):
        store_identifiers = {path.split(os.sep)[-1][:STORED_SESSION_BYTES] for path in cls.__store}
        return set(identifiers).difference(store_identifiers)

    @classmethod
    def delete_from_identifiers(cls, identifiers):
        path_to_remove = []
        for path in cls.__store:
            sid = path.split(os.sep)[-1]
            if any(sid.startswith(identifier) for identifier in identifiers):
                path_to_remove.append(path)
        for path in path_to_remove:
            cls.__store.pop(path)


Session = FileSession
