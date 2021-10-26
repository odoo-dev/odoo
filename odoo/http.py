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


# =========================================================
# Request and Response
# =========================================================

# Thread local global request object
_request_stack = werkzeug.local.LocalStack()
request = _request_stack()

class Response(werkzeug.wrappers.Response):
    """
    Outgoing HTTP response with body, status, headers and qweb support.
    """

class Request:
    """
    Wrapper around the incomming HTTP request with deserialized request
    parameters, session utilities and request dispatching logic.
    """

    # =====================================================
    # HTTP Controllers
    # =====================================================
    def _http_dispatch(self, ...):
        """
        Perform http-related actions such as deserializing the request
        body and query-string or checking cors/csrf while dispatching a
        request to a ``type='http'`` route.
        """

    def _http_handle_error(self, exc):
        """
        Handle any exception that occured while dispatching a request to
        a `type='http'` route. Also handle exceptions that occured when
        no route matched the request path, that no fallback page could
        be delivered and that the request ``Content-Type`` was not json.

        :param exc Exception: the exception that occured.
        """

    # =====================================================
    # JSON-RPC2 Controllers
    # =====================================================
    def _json_dispatch(self, ...):
        """
        Perform json-related actions such as deserializing the request
        body while dispatching a request to a ``type='json'`` route.
        """

    def _json_handle_error(self, exc):
        """
        Handle any exception that occured while dispatching a request to
        a `type='json'` route. Also handle exceptions that occured when
        no route matched the request path, that no fallback page could
        be delivered and that the request ``Content-Type`` was json.

        :param exc Exception: the exception that occured.
        """

    # =====================================================
    # Routing
    # =====================================================
    def _serve_static(self):
        """ Serve a static file from the file system. """

    def _serve_nodb(self):
        """
        Dispatch the request to its matching controller in a
        database-free environment.
        """

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

    def _serve_ir_http(self):
        """
        Delegate most of the processing to the ir.http model that is
        extensible by applications.
        """


# =========================================================
# WSGI Layer
# =========================================================
class Application(object):
    """ Odoo WSGI application """
    # See also: https://www.python.org/dev/peps/pep-3333

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


app = application = root = Application()
