# Part of Odoo. See LICENSE file for full copyright and licensing details.
r"""\
Odoo HTTP layer / WSGI application

The main duty of this module is to prepare and dispatch all http
requests to their corresponding controllers: from a raw http request
arriving on the WSGI entrypoint to a :class:`~http.Request`: arriving at
a module controller with a fully setup ORM available.

Application developers mostly know this module thanks to the
:class:`~odoo.http.Controller`: class and its companion the
:func:`~odoo.http.route`: method decorator. Together they are used to
register methods responsible of delivering web content to matching URLS.

Those two are only the tip of the iceberg, below is an ascii graph that
shows the various processing layers each request passes through before
ending at the @route decorated endpoint. Hopefully, this graph and the
attached function descriptions will help you understand this module.

Here be dragons:

Application.__call__
    +-> Request._serve_static
    |
    +-> Request._serve_nodb
    |   -> App.nodb_routing_map.match
    |   -> Request._pre_dispatch
    |   ------------------------------------->|                            +----------------------------->|
    |                                         |                            |            (nodb)            |
    +-> Request._serve_db                     |                            |                              |
        -> model.retrying                     |                            |                              |
           -> Request._serve_ir_http          +-> Request._http_dispatch ->|                              +-> route_wrapper
              -> env['ir.http']._match        +-> Request._json_dispatch ->|                              |   -> endpoint
              -> env['ir.http']._authenticate |                            |                              |
              -> env['ir.http']._pre_dispatch |                            |                              |
                 -> Request._pre_dispatch     |                            |             (db)             |
              ------------------------------->|                            +-> env['ir.http']._dispatch ->|

Application.__call__
  WSGI entry point, it sanitizes the request, it wraps it in a werkzeug
  request and itself in an Odoo http request. The Odoo http request is
  exposed at ``http.request`` then it is forwarded to either
  ``_serve_static``, ``_serve_nodb`` or ``_serve_db`` depending on the
  request path and the presence of a database. It is also responsible of
  ensuring any error is properly logged and encapsuled in a HTTP error
  response.

Request._serve_static
  Handle all requests to ``/<module>/static/<asset>`` paths, open the
  underlying file on the filesystem and stream it via
  :meth:``Request.send_filepath``

Request._serve_nodb
  Handle requests to ``@route(auth='none')`` endpoints when the user is
  not connected to a database. It performs limited operations, just
  matching the auth='none' endpoint using the request path and then it
  forwards the dispatching to either ``_http_dispacth`` or
  ``_json_dispatch``.

Request._serve_db
  Handle all requests that are not static when it is possible to connect
  to a database. It opens a session and initializes the ORM before
  forwarding the request to ``retrying`` and ``_serve_ir_http``.

service.model.retrying
  Protect against SQL serialisation errors (when two different
  transactions write on the same record), when such an error occurs this
  function resets the session and the environment then re-dispatches the
  request.

Request._serve_ir_http
  Delegate most of the effort to the ``ir.http`` abstract model which
  can be extended in modules. This model is responsible of:

  (1) matching an endpoint based on the request path;
  (2) serving some pages that are not accessible via the router such as
      the attachements or the website pages;
  (3) ensuring the user has access to the requested endpoint;
  (4) preparing the system before dispatching the request (e.g. saving
      '?debug=1' in the session);
  (5) forwarding the request to the endpoint once the request body has
      been deserialized by either ``request._http_dispatch`` or
      ``request._json_dispatch``.

Request._http_dispatch
  Handle requests to ``@route(type='http')`` endpoints, gather the
  arguments from the path, the query string, the body forms and the body
  files. Perform cors and csrf checks then call the endpoint.

Request._json_dispatch
  Handle requests to ``@route(type='json')`` endpoints, lobotomized
  implementation of jsonrpc2, it only uses the ``params`` of the JSON
  serialized body and uses it as kwargs for calling the endpoint.

env['ir.http']._dispatch
  Only in the context of a ``_serve_db`` request. It just calls the
  route endpoint when no other module than base is installed. Other
  modules may override the method and act as middleware. See also the
  ``env['ir.http']._pre_dispatch`` method (no 4 above).

route_wrapper, closure of the http.route decorator
  Sanitize the request parameters, call the route endpoint and
  optionaly coerce the endpoint result.

endpoint
  The @route(...) decorated method.
"""

import collections
import contextlib
import functools
import hashlib
import hmac
import inspect
import io
import json
import logging
import mimetypes
import os
import re
import secrets
import threading
import time
import traceback
import warnings
import zlib
from datetime import datetime
from os.path import join as opj

import babel.core
import psycopg2
import werkzeug.datastructures
import werkzeug.exceptions
import werkzeug.local
import werkzeug.routing
import werkzeug.security
import werkzeug.wrappers
import werkzeug.wsgi
from werkzeug.urls import URL, url_parse, url_encode, url_quote
from werkzeug.exceptions import (HTTPException, BadRequest, Forbidden,
                                 NotFound, InternalServerError)
try:
    from werkzeug.middleware.proxy_fix import ProxyFix as ProxyFix_
    ProxyFix = functools.partial(ProxyFix_, x_for=1, x_proto=1, x_host=1)
except ImportError:
    from werkzeug.contrib.fixers import ProxyFix

# Optional psutil, not packaged on windows
try:
    import psutil
except ImportError:
    psutil = None

import odoo
from .exceptions import UserError, AccessError, AccessDenied
from .modules.module import get_manifest
from .modules.registry import Registry
from .service.server import memory_info
from .service import security, model as service_model
from .sql_db import db_connect
from .tools import (config, consteq, date_utils, Namespace, profiler,
                    resolve_attr, submap, unique, ustr,)
from .tools.mimetypes import guess_mimetype
from .tools.func import filter_kwargs, lazy_property


_logger = logging.getLogger(__name__)


# =========================================================
# Lib fixes
# =========================================================

# Add potentially missing (older ubuntu) font mime types
mimetypes.add_type('application/font-woff', '.woff')
mimetypes.add_type('application/vnd.ms-fontobject', '.eot')
mimetypes.add_type('application/x-font-ttf', '.ttf')
# Add potentially wrong (detected on windows) svg mime types
mimetypes.add_type('image/svg+xml', '.svg')

# To remove when corrected in Babel
babel.core.LOCALE_ALIASES['nb'] = 'nb_NO'


# =========================================================
# Const
# =========================================================

# The validity duration of a preflight response, one day.
CORS_MAX_AGE = 60 * 60 * 24

# The default validity duration for new csrf tokens, two days.
DEFAULT_CSRF_TOKEN_LIFETIME = 60 * 60 * 24 * 2

# The dictionnary to initialise a new session with.
DEFAULT_SESSION = {
    'context': {},
    'debug': '',
    'login': None,
    'uid': None,
    'session_token': None,
}

# The request mimetypes that transport JSON in their body.
JSON_MIMETYPES = ('application/json', 'application/json-rpc')

# The @route arguments to propagate from the decorated method to the
# routing rule.
ROUTING_KEYS = {
    'defaults', 'subdomain', 'build_only', 'strict_slashes', 'redirect_to',
    'alias', 'host', 'methods',
}

# The duration of a user session before it is considered expirated,
# three months.
SESSION_LIFETIME = 60 * 60 * 24 * 90

# The cache duration for static content from the filesystem, one week.
STATIC_CACHE = 60 * 60 * 24 * 7

# The cache duration for content where the url uniquely identifies the
# content (usually using a hash), one year.
STATIC_CACHE_LONG = 60 * 60 * 24 * 365


# =========================================================
# Helpers
# =========================================================

def db_list(force=False, httprequest=None):
    """
    Get the list of available databases

    :param bool force: See :func:`~odoo.service.db.list_dbs`:
    :param Optional[werkzeug.Request] httprequest:
        See `:func:~odoo.http.db_filter:`.
    :returns: the list of available databases
    :rtype: List[str]
    """
    dbs = odoo.service.db.list_dbs(force)
    return db_filter(dbs, httprequest=httprequest)

def db_filter(dbs, httprequest=None):
    """
    Return the subset of ``dbs`` that match the dbfilter or the dbname
    server configuration. In case neither are configured, return ``dbs``
    as-is.

    :param Iterable[str] dbs: The list of database names to filter.
    :param Optional[werkzeug.Request] httprequest: The request from
        which to extract the hostname and domain that are injected in
        the ``%d`` and ``%h`` dbfilter placeholders.
    :returns: The original list filtered.
    :rtype: List[str]
    """

    if config['dbfilter']:
        #        host
        #     -----------
        # www.example.com:80
        #     -------
        #     domain
        host = (httprequest or request.httprequest).environ.get('HTTP_HOST', '')
        host = host.partition(':')[0]
        if host.startswith('www.'):
            host = host[4:]
        domain = host.partition('.')[0]

        dbfilter_re = re.compile(
            config["dbfilter"].replace("%h", re.escape(host))
                              .replace("%d", re.escape(domain)))
        return [db for db in dbs if dbfilter_re.match(db)]

    if config['db_name']:
        # In case --db-filter is not provided and --database is passed, Odoo will
        # use the value of --database as a comma separated list of exposed databases.
        exposed_dbs = {db.strip() for db in config['db_name'].split(',')}
        return sorted(exposed_dbs.intersection(dbs))

    return list(dbs)

def is_cors_preflight(endpoint):
    return (_request_stack.top
        and request.httprequest.method == 'OPTIONS'
        and 'cors' in endpoint.routing
    )

def send_file(filepath_or_fp, **send_file_kwargs):
    warnings.warn(
        "http.send_file is a deprecated alias to http.request.send_file",
        DeprecationWarning, stacklevel=2)

    if isinstance(filepath_or_fp, str):  # file-path
        return request.send_filepath(filepath_or_fp, **send_file_kwargs)
    else:  # file-object
        return request.send_file(filepath_or_fp, **send_file_kwargs)


# =========================================================
# Controller and routes
# =========================================================

class Controller:
    """
    Class mixin that provide module controllers the ability to serve
    content over http and to be extended in child modules.

    Each class :ref:`inheriting <python:tut-inheritance>` from
    :class:`~odoo.http.Controller` can use the :func:`~odoo.http.route`:
    decorator to route matching incoming web requests to decorated
    methods.

    Like models, controllers can be extended by other modules. The
    extension mechanism is different because controllers can work in a
    database-free environment and therefore cannot use
    :class:~odoo.api.Registry:.

    To *override* a controller, :ref:`inherit <python:tut-inheritance>`
    from its class, override relevant methods and re-expose them with
    :func:`~odoo.http.route`:. Please note that the decorators of all
    methods are combined, if the overriding method’s decorator has no
    argument all previous ones will be kept, any provided argument will
    override previously defined ones.

    .. code-block:

        class GreetingController(odoo.http.Controller):
            @route('/greet', type='http', auth='public')
            def greeting(self):
                return 'Hello'

        class UserGreetingController(GreetingController):
            @route(auth='user')  # override auth, keep path and type
            def greeting(self):
                return super().handler()
    """
    children_classes = collections.defaultdict(list)  # indexed by module

    @classmethod
    def __init_subclass__(cls):
        super().__init_subclass__()
        if Controller in cls.__bases__:
            path = cls.__module__.split('.')
            module = path[2] if path[:2] == ['odoo', 'addons'] else ''
            Controller.children_classes[module].append(cls)


def route(route=None, **routing):
    """
    Decorate a controller method in order to route incoming requests
    matching the given URL and options to the decorated method.

    .. warning::
        It is mandatory to re-decorate any method that is overridden in
        controller extensions but the arguments can be omitted. See
        :class:`~odoo.http.Controller` for more details.

    :param Union[str, Iterable[str]] route: The paths that the decorated
        method is serving. Incoming HTTP request paths matching this
        route will be routed to this decorated method. See `werkzeug
        routing documentation <http://werkzeug.pocoo.org/docs/routing/>`_
        for the format of route expressions.
    :param str type: The type of request, either ``'json'`` or
        ``'http'``. It describes where to find the request parameters
        and how to serialize the response.
    :param str auth: The authentication method, one of the following:
         * ``'user'``: The user must be authenticated and the current
           request will be executed using the rights of the user.
         * ``'public'``: The user may or may not be authenticated. If he
           isn't, the current request will be executed using the shared
           Public user.
         * ``'none'``: The method is always active, even if there is no
           database. Mainly used by the framework and authentication
           modules. There request code will not have any facilities to
           access the current user.
    :param Iterable[str] methods: A list of http methods (verbs) this
        route applies to. If not specified, all methods are allowed.
    :param str cors: The Access-Control-Allow-Origin cors directive value.
    :param bool csrf: Whether CSRF protection should be enabled for the
        route. Enabled by default for ``'http'``-type requests, disabled
        by default for ``'json'``-type requests. See
        :ref:`CSRF Protection <csrf>` for more.
    """
    def decorator(endpoint):
        fname = f"<function {endpoint.__module__}.{endpoint.__name__}>"

        # Sanitize the routing
        assert 'type' not in routing or routing['type'] in ('http', 'json')
        if route:
            routing['routes'] = route if isinstance(route, list) else [route]
        wrong = routing.pop('method', None)
        if wrong is not None:
            _logger.warning("%s defined with invalid routing parameter 'method', assuming 'methods'", fname)
            routing['methods'] = wrong

        @functools.wraps(endpoint)
        def route_wrapper(self, *args, **params):
            params_ok = filter_kwargs(endpoint, params)
            params_ko = set(params) - set(params_ok)
            if params_ko:
                _logger.warning("%s called ignoring args %s", fname, params_ko)

            result = endpoint(self, *args, **params_ok)
            if routing['type'] == 'http':  # _generate_routing_rules() ensures type is set
                return Response.load(result)
            return result

        route_wrapper.original_routing = routing
        route_wrapper.original_endpoint = endpoint
        return route_wrapper
    return decorator

def _generate_routing_rules(modules, nodb_only, converters=None):
    def is_valid(cls):
        path = cls.__module__.split('.')
        return path[:2] == ['odoo', 'addons'] and path[2] in modules

    def get_leaf_classes(cls):
        result = []
        for subcls in cls.__subclasses__():
            if is_valid(subcls):
                result.extend(get_leaf_classes(subcls))
        if not result and is_valid(cls):
            result.append(cls)
        return result

    def build_controllers():
        highest_controllers = []
        for module in modules:
            highest_controllers.extend(Controller.children_classes.get(module, []))

        for top_ctrl in highest_controllers:
            leaf_controllers = list(unique(get_leaf_classes(top_ctrl)))
            name = '{} (extended by {})'.format(
                top_ctrl.__name__,
                ', '.join(bot_ctrl.__name__ for bot_ctrl in leaf_controllers),
            )
            Ctrl = type(name, tuple(reversed(leaf_controllers)), {})
            yield Ctrl()

    for ctrl in build_controllers():
        for method_name, method in inspect.getmembers(ctrl, inspect.ismethod):

            # Skip this method if it is not @route decorated anywhere in
            # the hierarchy
            def is_method_a_route(cls):
                return resolve_attr(cls, f'{method_name}.original_routing', None) is not None
            if not any(map(is_method_a_route, type(ctrl).mro())):
                continue

            merged_routing = {
                # 'type': 'http',  # set below
                'auth': 'user',
                'methods': None,
                'routes': [],
                'readonly': False,
            }

            for cls in unique(reversed(type(ctrl).mro())):  # ancestors first
                submethod = getattr(cls, method_name, None)
                if submethod is None:
                    continue

                if not hasattr(submethod, 'original_routing'):
                    _logger.warning("The endpoint %s is not decorated by @route(), decorating it myself.", f'{cls.__module__}.{cls.__name__}.{method_name}')
                    submethod = route()(submethod)

                # Ensure "type" is defined on each method's own routing,
                # also ensure overrides don't change the routing type.
                default_type = submethod.original_routing.get('type', 'http')
                routing_type = merged_routing.setdefault('type', default_type)
                if submethod.original_routing.get('type') not in (None, routing_type):
                    _logger.warning("The endpoint %s changes the route type, using the original type: %r.", f'{cls.__module__}.{cls.__name__}.{method_name}', routing_type)
                submethod.original_routing['type'] = routing_type

                merged_routing.update(submethod.original_routing)

            if not merged_routing['routes']:
                _logger.warning("%s is a controller endpoint without any route, skipping.", f'{cls.__module__}.{cls.__name__}.{method_name}')
                continue

            if nodb_only and merged_routing['auth'] != "none":
                continue

            for url in merged_routing['routes']:
                # duplicates the function (partial) with a copy of the
                # original __dict__ (update_wrapper) to keep a reference
                # to `original_routing` and `original_endpoint`, assign
                # the merged routing ONLY on the duplicated function to
                # ensure method's immutability.
                endpoint = functools.partial(method)
                functools.update_wrapper(endpoint, method, assigned=())
                endpoint.routing = merged_routing

                yield (url, endpoint)


# =========================================================
# Request and Response
# =========================================================

# Thread local global request object
_request_stack = werkzeug.local.LocalStack()
request = _request_stack()


class Response(werkzeug.wrappers.Response):
    """
    Outgoing HTTP response with body, status, headers and qweb support.
    In addition to the :class:`werkzeug.wrappers.Response` parameters,
    this class's constructor can take the following additional
    parameters for QWeb Lazy Rendering.

    :param basestring template: template to render
    :param dict qcontext: Rendering context to use
    :param int uid: User id to use for the ir.ui.view render call,
        ``None`` to use the request's user (the default)

    these attributes are available as parameters on the Response object
    and can be altered at any time before rendering

    Also exposes all the attributes and methods of
    :class:`werkzeug.wrappers.Response`.
    """
    default_mimetype = 'text/html'

    def __init__(self, *args, **kw):
        template = kw.pop('template', None)
        qcontext = kw.pop('qcontext', None)
        uid = kw.pop('uid', None)
        super().__init__(*args, **kw)
        self.set_default(template, qcontext, uid)

    @classmethod
    def load(cls, result, fname="<function>"):
        """
        Convert the return value of an endpoint into a Response.

        :param result: The endpoint return value to load the Response from.
        :type result: Union[Response, werkzeug.wrappers.BaseResponse,
            werkzeug.exceptions.HTTPException, str, bytes, NoneType]
        :param str fname: The endpoint function name wherefrom the
            result emanated, used for logging.
        :return: The created :class:`~odoo.http.Response`.
        :rtype: Response
        :raises TypeError: When ``result`` type is none of the above-
            mentioned type.
        """
        if isinstance(result, Response):
            return result

        if isinstance(result, werkzeug.exceptions.HTTPException):
            _logger.warning("%s returns an HTTPException instead of raising it.", fname)
            raise result

        if isinstance(result, werkzeug.wrappers.BaseResponse):
            response = cls.force_type(result)
            response.set_default()
            return response

        if isinstance(result, (bytes, str, type(None))):
            return cls(result)

        raise TypeError(f"{fname} returns an invalid value: {result}")

    def set_default(self, template=None, qcontext=None, uid=None):
        self.template = template
        self.qcontext = qcontext or dict()
        self.qcontext['response_template'] = self.template
        self.uid = uid

    @property
    def is_qweb(self):
        return self.template is not None

    def render(self):
        """ Renders the Response's template, returns the result. """
        self.qcontext['request'] = request
        return request.env["ir.ui.view"]._render_template(self.template, self.qcontext)

    def flatten(self):
        """
        Forces the rendering of the response's template, sets the result
        as response body and unsets :attr:`.template`
        """
        if self.template:
            self.response.append(self.render())
            self.template = None



class FutureResponse:
    """ werkzeug.Response mock class that only serves as placeholder for
        headers to inject in the final response. """
    charset = 'utf-8'
    max_cookie_size = 4093

    def __init__(self):
        self.headers = werkzeug.datastructures.Headers()

    @functools.wraps(werkzeug.Response.set_cookie)
    def set_cookie(self, *args, **kwargs):
        werkzeug.Response.set_cookie(self, *args, **kwargs)


class Request:
    """
    Wrapper around the incomming HTTP request with deserialized request
    parameters, session utilities and request dispatching logic.
    """

    def __init__(self, httprequest):
        self.httprequest = httprequest
        self.type = 'json' if httprequest.mimetype in JSON_MIMETYPES else 'http'
        self.future_response = FutureResponse()
        #self.params = {}  # set in _http_dispatch and _json_dispatch

        self.db = None
        self.registry = None
        self.env = None

        self.session = Namespace()
        self.session_id = None
        self._session_save = False
        self._session_data = None

    # =====================================================
    # Getters and setters
    # =====================================================
    def update_env(self, user=None, context=None, su=None):
        """ Update the environment of the current request. """
        cr = None  # None is a sentinel, it keeps the same cursor
        self.env = self.env(cr, user, context, su)
        threading.current_thread().uid = self.env.uid

    def update_context(self, **overrides):
        """
        Override the environment context of the current request with the
        values of ``overrides``. To replace the entire context, please
        use :meth:`~update_env`: instead.
        """
        self.update_env(context=dict(self.env.context, **overrides))

    # =====================================================
    # Helpers
    # =====================================================
    def default_lang(self):
        lang = self.httprequest.accept_languages.best or "en-US"
        try:
            code, territory, _, _ = babel.core.parse_locale(lang, sep='-')
            if territory:
                lang = f'{code}_{territory}'
            else:
                lang = babel.core.LOCALE_ALIASES[code]
        except (ValueError, KeyError):
            lang = 'en_US'

        return lang

    # =====================================================
    # Session
    # =====================================================
    def _get_session_id(self):
        """
        Get the session identifier and the database from the request,
        only return the database when it is available.

        :returns: a pair (session_id, dbname), each may be an empty
            string when the info is missing or could not be determined.
        :rtype: Tuple[str, str]

        The session identifier is retrieve from the, in priority:
          * ``session_id`` query-string;
          * ``X-Openerp-Session-Id`` header (deprecated);
          * ``session_id`` cookie (usually set).

        The database is retrieve from the, in priority:
          * ``db`` query-string option;
          * ``session_id`` query-string option;
          * ``X-Openerp-Session-Id`` header (deprecated);
          * ``session_id`` cookie (usually set);
          * database list if there is only one database available.

        Because the two information share the same query-string option,
        cookie and header, the two are to be concatenated with a single
        dot separating the two: ``<session_id>.<dbname>``.
        """
        sid, _, requested_db = (
               self.httprequest.args.get('session_id')
            or self.httprequest.headers.get("X-Openerp-Session-Id")
            or self.httprequest.cookies.get('session_id')
            or ''
        ).partition('.')

        query_db = self.httprequest.args.get('db')
        if query_db is not None:
            requested_db = query_db

        available_dbs = db_list(httprequest=self.httprequest)
        if requested_db in available_dbs:
            return sid, requested_db

        all_dbs = db_list(force=True, httprequest=self.httprequest)
        if len(all_dbs) == 1:
            return sid, all_dbs[0]

        return sid, ''

    def _set_cookie_session_id(self, session_id, dbname):
        """
        Update the cookie session with a new session id and database.

        :param str session_id: The (possibly empty) session id.
        :param str dbname: The (possibly empty) database name.
        """
        self.future_response.set_cookie(
            'session_id', f'{session_id}.{dbname}',
            max_age=SESSION_LIFETIME, httponly=True
        )

    @contextlib.contextmanager
    def manage_session(self):
        """
        Load the session from the database (or use a default session if
        it is missing) and write it back (if modified) when the context
        manager exits without error.
        """
        with contextlib.closing(db_connect(self.db).cursor()) as cr:
            cr.execute("SELECT data FROM ir_session WHERE sid = %s", (self.session_id,))
            row = cr.fetchone()
            self._session_data = row[0] if row else '{}'

        self.session = Namespace(DEFAULT_SESSION, sid=self.session_id)
        self.session.update(json.loads(self._session_data))

        yield

        if self._session_save:
            self.save_session()

    def save_session(self):
        """
        Save the current session on the database. Does nothing if the
        session is not dirty.
        """
        session_data = json.dumps(self.session, ensure_ascii=False, sort_keys=True)
        if session_data == self._session_data:
            return

        with db_connect(self.db).cursor() as cr, \
             contextlib.suppress(psycopg2.OperationalError):
            cr.execute("""
                INSERT INTO ir_session (sid, data, create_date, write_date)
                VALUES (%(sid)s, %(data)s, NOW(), NOW())
                ON CONFLICT (sid)
                    DO UPDATE SET data=%(data)s, write_date=NOW()
            """, {
                'sid': self.session_id,
                'data': session_data,
            }, log_exceptions=False)

    def reload_session(self):
        """ Reload the session from the cache of the database. """
        self.session = Namespace(DEFAULT_SESSION, sid=self.session_id)
        self.session.update(json.loads(self._session_data))
        self.update_env(user=self.session.uid, context=self.session.context)

    def reset_session(self):
        """ Reset the session defaults, basically logout. """
        self.env.cr.execute('DELETE FROM ir_session WHERE sid = %s', [self.session.sid])
        self.session_id = secrets.token_urlsafe()
        self.session = Namespace(DEFAULT_SESSION, sid=self.session_id)
        self._set_cookie_session_id(self.session_id, self.db)

    def session_authenticate_start(self, login=None, password=None):
        """
        Authenticate the current user with the given db, login and
        password. If successful, store the authentication parameters in
        the current session and request, unless multi-factor-auth (MFA)
        is activated. In that case, that last part will be done by
        :ref:`session_authenticate_finalize`.
        """
        wsgienv = {
            "interactive": True,
            "base_location": self.httprequest.url_root.rstrip('/'),
            "HTTP_HOST": self.httprequest.environ['HTTP_HOST'],
            "REMOTE_ADDR": self.httprequest.environ['REMOTE_ADDR'],
        }
        uid = self.env['res.users'].authenticate(self.db, login, password, wsgienv)

        self.session.pre_login = login
        self.session.pre_uid = uid

        # if 2FA is disabled we finalize immediately
        user = self.env(user=uid)['res.users'].browse(uid)
        if not user._mfa_url():
            self.session_authenticate_finalize()

        return uid

    def session_authenticate_finalize(self):
        """
        Finalizes a partial session, should be called on MFA validation
        to convert a partial / pre-session into a logged-in one.
        """
        login = self.session.pop('pre_login')
        uid = self.session.pop('pre_uid')
        self.update_env(user=uid)
        self.update_context(**self.env['res.users'].context_get())

        self.session.update({
            'login': login,
            'uid': uid,
            'context': submap(self.env.context, ['lang']),
            'session_token': self.env.user._compute_session_token(self.session_id),
        })

    # =====================================================
    # HTTP Controllers
    # =====================================================
    def send_filepath(self, path, **send_file_kwargs):
        """
        High-level file streaming utility, it takes a path to a file on
        the filesystem.

        Never pass filenames to this function from user sources without
        checking them first.

        :param path-like path: The path to the file.
        :returns: The HTTP response that streams the file.
        :rtype: werkzeug.Response

        See :meth:`~odoo.http.request.send_file`: for the complete list
        of parameters.
        """
        fd = open(path, 'rb')  # closed by werkzeug
        return self.send_file(fd, **send_file_kwargs)

    def send_file(self, file, filename=None, mimetype=None, mtime=None, as_attachment=False, cache_timeout=STATIC_CACHE):
        """
        Low-level file streaming utility with mime and cache handling,
        it takes a file-object or immediately the content as bytes/str.

        Sends the content of a file to the client. This will use the
        most efficient method available and configured. By default it
        will try to use the WSGI server's file_wrapper support.

        If filename of file.name is provided it will try to guess the
        mimetype for you, but you can also explicitly provide one.

        For extra security you probably want to send certain files as
        attachment (e.g. HTML).

        :param Union[io.BaseIO,bytes,str] file: fileobject to read from
            or the content as bytes or str.
        :param str filename: optional if file has a 'name' attribute,
            used for attachment name and mimetype guess.
        :param str mimetype: the mimetype of the file if provided,
            otherwise auto detection happens based on the name.
        :param datetime mtime: optional if file has a 'name' attribute,
            last modification time used for conditional response.
        :param bool as_attachment: set to `True` if you want to send
            this file with a ``Content-Disposition: attachment`` header.
        :param int cache_timeout: set to `False` to disable etags and
            conditional response handling (last modified and etags)
        :returns: the HTTP response that streams the file.
        """
        if isinstance(file, str):
            file = file.encode('utf8')
        if isinstance(file, bytes):
            file = io.BytesIO(file)

        # Only used when filename or mtime argument is not provided
        path = getattr(file, 'name', 'file.bin')

        if not filename:
            filename = os.path.basename(path)

        if not mimetype:
            mimetype = mimetypes.guess_type(filename)[0] or 'application/octet-stream'

        file.seek(0, 2)
        size = file.tell()
        file.seek(0)

        data = werkzeug.wsgi.wrap_file(self.httprequest.environ, file)

        res = werkzeug.wrappers.Response(data, mimetype=mimetype, direct_passthrough=True)
        res.content_length = size

        if as_attachment:
            res.headers.add('Content-Disposition', 'attachment', filename=filename)

        if cache_timeout:
            if not mtime:
                with contextlib.suppress(FileNotFoundError):
                    mtime = datetime.fromtimestamp(os.path.getmtime(path))
            if mtime:
                res.last_modified = mtime
            crc = zlib.adler32(filename.encode('utf-8') if isinstance(filename, str) else filename) & 0xffffffff
            etag = f'odoo-{mtime}-{size}-{crc}'
            if not werkzeug.http.is_resource_modified(self.httprequest.environ, etag, last_modified=mtime):
                res = werkzeug.wrappers.Response(status=304)
            else:
                res.cache_control.public = True
                res.cache_control.max_age = cache_timeout
                res.set_etag(etag)
        return res

    def csrf_token(self, time_limit=DEFAULT_CSRF_TOKEN_LIFETIME):
        """
        Generates and returns a CSRF token for the current session

        :param Optional[int] time_limit: the CSRF token should only be
            valid for the specified duration (in second), by default
            48h, ``None`` for the token to be valid as long as the
            current user's session is.
        :returns: ASCII token string
        :rtype: str
        """
        secret = self.env['ir.config_parameter'].sudo().get_param('database.secret')
        if not secret:
            raise ValueError("CSRF protection requires a configured database secret")

        # if no `time_limit` => distant 1y expiry (31536000) so max_ts acts as salt, e.g. vs BREACH
        max_ts = int(time.time() + (time_limit or 31536000))
        msg = f'{self.session_id}{max_ts}'.encode('utf-8')

        hm = hmac.new(secret.encode('ascii'), msg, hashlib.sha1).hexdigest()
        return f'{hm}o{max_ts}'

    def validate_csrf(self, csrf):
        """
        Is the given csrf token valid ?

        :param str csrf: The token to validate.
        :returns: ``True`` when valid, ``False`` when not.
        :rtype: bool
        """
        if not csrf:
            return False

        secret = self.env['ir.config_parameter'].sudo().get_param('database.secret')
        if not secret:
            raise ValueError("CSRF protection requires a configured database secret")

        hm, _, max_ts = csrf.rpartition('o')
        msg = f'{self.session_id}{max_ts}'.encode('utf-8')

        if max_ts:
            try:
                if int(max_ts) < int(time.time()):
                    return False
            except ValueError:
                return False

        hm_expected = hmac.new(secret.encode('ascii'), msg, hashlib.sha1).hexdigest()
        return consteq(hm, hm_expected)

    def get_http_params(self):
        """
        Extract key=value pairs from the query string and the forms
        present in the body (both application/x-www-form-urlencoded and
        multipart/form-data).

        :returns: The merged key-value pairs.
        :rtype: dict
        """
        params = {
            **self.httprequest.args,
            **self.httprequest.form,
            **self.httprequest.files
        }
        params.pop('session_id', None)
        return params

    def _http_dispatch(self, endpoint, args):
        """
        Perform http-related actions such as deserializing the request
        body and query-string or checking cors/csrf while dispatching a
        request to a ``type='http'`` route.

        See :meth:`~odoo.http.Response.load`: method for the compatible
        endpoint return types.
        """
        self.params = dict(self.get_http_params(), **args)

        # Check for CSRF token for relevant requests
        if self.httprequest.method not in ('GET', 'HEAD', 'OPTIONS', 'TRACE') and endpoint.routing.get('csrf', True):
            if not self.db:
                return self.redirect('/web/database/selector')

            token = self.params.pop('csrf_token', None)
            if not self.validate_csrf(token):
                if token is not None:
                    _logger.warning("CSRF validation failed on path '%s'", self.httprequest.path)
                else:
                    _logger.warning("No CSRF token provided for path '%s' https://www.odoo.com/documentation/15.0/reference/addons/http.html#csrf for more details.", request.httprequest.path)
                raise werkzeug.exceptions.BadRequest('Session expired (invalid CSRF token)')

        if self.db:
            return self.env['ir.http']._dispatch(endpoint)
        else:
            return endpoint(**self.params)

    def _http_handle_error(self, exc):
        """
        Handle any exception that occured while dispatching a request to
        a `type='http'` route. Also handle exceptions that occured when
        no route matched the request path, that no fallback page could
        be delivered and that the request ``Content-Type`` was not json.

        :param exc Exception: the exception that occured.
        :returns: an HTTP error response
        :rtype: werkzeug.wrapper.Response
        """
        if isinstance(exc, SessionExpiredException):
            redirect = self.redirect_query('/web/login', {
                'redirect': (
                    f'/web/proxy/post{self.httprequest.full_path}'
                    if self.httprequest.method == 'POST'
                    else self.httprequest.url
                ),
            })
            redirect.set_cookie('session_id', f'.{self.db}', max_age=SESSION_LIFETIME, httponly=True)
            return redirect

        return (exc if isinstance(exc, HTTPException)
           else Forbidden(exc.args[0]) if isinstance(exc, (AccessDenied, AccessError))
           else BadRequest(exc.args[0]) if isinstance(exc, UserError)
           else InternalServerError()  # hide the real error
        )

    # =====================================================
    # JSON-RPC2 Controllers
    # =====================================================
    def _json_dispatch(self, endpoint, args):
        """
        `JSON-RPC 2 <http://www.jsonrpc.org/specification>`_ over HTTP.

        Our implementation differs from the specification on two points:

        1. The ``method`` member of the JSON-RPC request payload is
           ignored as the HTTP path is already used to route the request
           to the controller.
        2. We only support parameter structures by-name, i.e. the
           ``params`` member of the JSON-RPC request payload MUST be a
           JSON Object and not a JSON Array.

        In addition, it is possible to pass a context that replaces
        the session context via a special ``context`` argument that is
        removed prior to calling the endpoint.

        Sucessful request::

          --> {"jsonrpc": "2.0", "method": "call", "params": {"context": {}, "arg1": "val1" }, "id": null}

          <-- {"jsonrpc": "2.0", "result": { "res1": "val1" }, "id": null}

        Request producing a error::

          --> {"jsonrpc": "2.0", "method": "call", "params": {"context": {}, "arg1": "val1" }, "id": null}

          <-- {"jsonrpc": "2.0", "error": {"code": 1, "message": "End user error message.", "data": {"code": "codestring", "debug": "traceback" } }, "id": null}

        """
        body = self.httprequest.get_data().decode(self.httprequest.charset)
        try:
            self.jsonrequest = json.loads(body)
        except ValueError:
            _logger.info('%s: Invalid JSON data\n%s', self.httprequest.path, body)
            raise werkzeug.exceptions.BadRequest(f"Invalid JSON data:\n{body}")

        self.params = dict(self.jsonrequest.get('params', {}), **args)
        ctx = self.params.pop('context', None)
        if ctx is not None and self.db:
            self.update_env(context=ctx)

        if self.db:
            result = self.env['ir.http']._dispatch(endpoint)
        else:
            result = endpoint(**self.params)
        return self._json_response(result, request_id=self.jsonrequest.get('id'))

    def _json_response(self, result=None, error=None, request_id=None):
        status = 200
        response = {'jsonrpc': '2.0', 'id': request_id}
        if error is not None:
            response['error'] = error
            status = error.pop('http_status', 200)
        if result is not None:
            response['result'] = result

        body = json.dumps(response, default=date_utils.json_default)

        return Response(body, status=status, headers=[
            ('Content-Type', 'application/json'),
            ('Content-Length', len(body)),
        ])

    def _json_handle_error(self, exc):
        """
        Handle any exception that occured while dispatching a request to
        a `type='json'` route. Also handle exceptions that occured when
        no route matched the request path, that no fallback page could
        be delivered and that the request ``Content-Type`` was json.

        :param exc Exception: the exception that occured.
        :returns: an HTTP error response
        :rtype: Response
        """
        error = {
            'code': 200,  # this code is the JSON-RPC level code, it is
                          # distinct from the HTTP status code. This
                          # code is ignored and the value 200 (while
                          # misleading) is totally arbitrary.
            'message': "Odoo Server Error",
            'data': serialize_exception(exc),
        }
        if isinstance(exc, NotFound):
            error['http_status'] = 404
            error['code'] = 404
            error['message'] = "404: Not Found"
        elif isinstance(exc, SessionExpiredException):
            error['code'] = 100
            error['message'] = "Odoo Session Expired"

        return self._json_response(error=error, request_id=getattr(self, 'jsonrequest', {}).get('id'))

    # =====================================================
    # Routing
    # =====================================================
    def _inject_future_response(self, response):
        response.headers.extend(self.future_response.headers)
        return response

    def _pre_dispatch(self, rule, args):
        routing = rule.endpoint.routing
        set_header = self.future_response.headers.set

        cors = routing.get('cors')
        if cors:
            set_header('Access-Control-Allow-Origin', cors)
            set_header('Access-Control-Allow-Methods', (
                     'POST' if routing['type'] == 'json'
                else ', '.join(routing['methods'] or ['GET', 'POST'])
            ))

        if cors and self.httprequest.method == 'OPTIONS':
            set_header('Access-Control-Max-Age', CORS_MAX_AGE)
            set_header('Access-Control-Allow-Headers',
                'Origin, X-Requested-With, Content-Type, Accept, Authorization')
            werkzeug.exceptions.abort(self._inject_future_response(Response()))

        if self.type != routing['type']:
            _logger.warning("Request's content type is %s but '%s' is type %s.", self.type, routing['routes'][0], routing['type'])
            raise BadRequest(f"Request's content type is {self.type} but '{routing['routes'][0]}' is type {routing['type']}.")

    def _serve_static(self):
        """ Serve a static file from the file system. """
        module, _, path = self.httprequest.path[1:].partition('/static/')
        try:
            directory = app.statics[module]
            filepath = werkzeug.security.safe_join(directory, path)
            return self.send_filepath(filepath)
        except KeyError:
            raise NotFound(f'Module "{module}" not found.\n')
        except OSError:  # cover both missing file and invalid permissions
            raise NotFound(f'File "{path}" not found in module {module}.\n')

    def _serve_nodb(self):
        """
        Dispatch the request to its matching controller in a
        database-free environment.
        """
        router = app.nodb_routing_map.bind_to_environ(self.httprequest.environ)
        rule, args = router.match(return_rule=True)
        self._pre_dispatch(rule, args)
        if self.type == 'json':
            response = self._json_dispatch(rule.endpoint, args)
        else:
            response = self._http_dispatch(rule.endpoint, args)
        self._inject_future_response(response)
        return response

    def _serve_db(self, dbname, session_id):
        """
        Prepare the user session and load the ORM before forwarding the
        request to ``_serve_ir_http``.

        :param str dbname: the name of the database to connect to.
        :param str session_id: optionnal secret session identifier to
            use to fetch the user's session from the database. When
            missing, a new random secret session identifier is granted
            and saved in the response cookies.
        """
        self.db = threading.current_thread().dbname = dbname
        self.session_id = session_id = session_id or secrets.token_urlsafe()
        self._set_cookie_session_id(session_id, dbname)

        with self.manage_session():
            try:
                self.registry = Registry(dbname)
                self.registry.check_signaling()
            except (AttributeError, psycopg2.OperationalError, psycopg2.ProgrammingError):
                # psycopg2 error or attribute error while constructing
                # the registry. That means either
                #  - the database probably does not exists anymore, or
                #  - the database is corrupted, or
                #  - the database version doesnt match the server version.
                # So remove the database from the cookie
                redirect = self.redirect('/web/database/selector')
                self._set_cookie_session_id(self.session_id, dbname='')
                return redirect

            with contextlib.closing(self.registry.cursor()) as cr:
                self.env = odoo.api.Environment(cr, self.session.uid, self.session.context)
                threading.current_thread().uid = self.env.uid
                if 'lang' not in self.env.context:
                    self.update_context(lang=self.default_lang())

                try:
                    return service_model.retrying(self._serve_ir_http, self.env)
                except Exception as exc:
                    if isinstance(exc, HTTPException) and exc.code is None:
                        raise  # bubble up to odoo.http.Application.__call__
                    if 'werkzeug' in config['dev_mode']:
                        raise  # bubble up to werkzeug.debug.DebuggedApplication

                    if request.type == 'json':
                        exc.error_response = self.env['ir.http']._json_handle_error(exc)
                    else:
                        exc.error_response = self.env['ir.http']._http_handle_error(exc)
                    raise

    def _serve_ir_http(self):
        """
        Delegate most of the processing to the ir.http model that is
        extensible by applications.
        """
        ir_http = self.env['ir.http']

        try:
            rule, args = ir_http._match(self.httprequest.path)
        except NotFound:
            self.params = self.get_http_params()
            response = ir_http._serve_fallback()
            if response:
                self._inject_future_response(response)
                return response
            raise

        self._session_save = rule.endpoint.routing.get('save_session', True)
        if not self._session_save:
            self._set_cookie_session_id(session_id='', dbname=self.db)

        ir_http._authenticate(rule.endpoint)
        ir_http._pre_dispatch(rule, args)
        if self.type == 'json':
            response = self._json_dispatch(rule.endpoint, args)
        else:
            response = self._http_dispatch(rule.endpoint, args)
        self._inject_future_response(response)
        return response


# =========================================================
# WSGI Layer
# =========================================================
class Application(object):
    """ Odoo WSGI application """
    # See also: https://www.python.org/dev/peps/pep-3333

    @lazy_property
    def statics(self):
        """
        Map module names to their absolute ``static`` path on the file
        system.
        """
        mod2path = {}
        for addons_path in odoo.addons.__path__:
            for module in os.listdir(addons_path):
                manifest = get_manifest(module)
                static_path = opj(addons_path, module, 'static')
                if (manifest
                        and manifest['installable']
                        and manifest['assets']
                        and os.path.isdir(static_path)):
                    mod2path[module] = static_path
        return mod2path

    @lazy_property
    def nodb_routing_map(self):
        nodb_routing_map = werkzeug.routing.Map(strict_slashes=False, converters=None)
        for url, endpoint in _generate_routing_rules([''] + odoo.conf.server_wide_modules, nodb_only=True):
            rule = werkzeug.routing.Rule(url, endpoint=endpoint, **submap(endpoint.routing, ROUTING_KEYS))
            rule.merge_slashes = False
            nodb_routing_map.add(rule)

        return nodb_routing_map

    def __call__(self, environ, start_response):
        """
        WSGI application entry point.

        :param dict environ: container for CGI environment variables
            such as the request HTTP headers, the source IP address and
            the body as an io file.
        :param callable start_response: function provided by the WSGI
            server that this application must call in order to send the
            HTTP response status line and the response headers.
        """
        if environ['REQUEST_METHOD'] == 'GET' and '//' in environ['PATH_INFO']:
            return werkzeug.utils.redirect(
                environ['PATH_INFO'].replace('//', '/'), 301)

        if odoo.tools.config['proxy_mode'] and environ.get("HTTP_X_FORWARDED_HOST"):
            # The ProxyFix middleware has a side effect of updating the
            # environ, see https://github.com/pallets/werkzeug/pull/2184
            def fake_app(environ, start_response):
                return []
            def fake_start_response(status, headers):
                return
            ProxyFix(fake_app)(environ, fake_start_response)

        httprequest = werkzeug.wrappers.Request(environ)
        httprequest.parameter_storage_class = (
            werkzeug.datastructures.ImmutableOrderedMultiDict)
        request = Request(httprequest)
        _request_stack.push(request)

        current_thread = threading.current_thread()
        current_thread.query_count = 0
        current_thread.query_time = 0
        current_thread.perf_t0 = time.time()
        current_thread.url = httprequest.url

        if self.statics is None:
            self.load_statics()

        try:
            segments = httprequest.path.split('/')
            if len(segments) >= 4 and segments[2] == 'static':
                response = request._serve_static()
            else:
                sid, dbname = request._get_session_id()
                if dbname is None:
                    response = request._serve_nodb()
                else:
                    response = request._serve_db(dbname, sid)
            return response(environ, start_response)

        except Exception as exc:
            # Valid (2xx/3xx) response returned via werkzeug.exceptions.abort.
            if isinstance(exc, HTTPException) and exc.code is None:
                response = exc.get_response()
                return response(environ, start_response)

            # Logs the error here so the traceback starts with ``__call__``.
            if hasattr(exc, 'loglevel'):
                _logger.log(exc.loglevel, exc, exc_info=getattr(exc, 'exc_info', None))
            elif isinstance(exc, HTTPException):
                pass
            elif isinstance(exc, SessionExpiredException):
                _logger.info(exc)
            elif isinstance(exc, (UserError, AccessError, NotFound)):
                _logger.warning(exc)
            else:
                _logger.error("Exception during request handling.", exc_info=True)

            # Server is running with --dev=werkzeug, bubble the error up
            # to werkzeug so he can fire up a debugger.
            if 'werkzeug' in config['dev_mode']:
                raise

            # Ensure there is always a Response attached to the exception.
            if not hasattr(exc, 'error_response'):
                if request.type == 'json':
                    exc.error_response = request._json_handle_error(exc)
                else:
                    exc.error_response = request._http_handle_error(exc)

            return exc.error_response(environ, start_response)

        finally:
            _request_stack.pop()

app = application = root = Application()
