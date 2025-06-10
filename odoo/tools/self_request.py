"""The :mod:`odoo.tools.self_request` module
provides utilities to simulate HTTP requests to the Odoo application.
It includes functions to generate WSGI environments and simulate
HTTP responses from the Odoo WSGI app.
"""
import logging
import os
import threading
from collections.abc import Generator
from contextlib import contextmanager
from datetime import datetime, timezone
from email.utils import format_datetime
from wsgiref.types import WSGIEnvironment

from werkzeug.test import create_environ, run_wsgi_app

import odoo
from odoo.http import request, root
from odoo.tools import config

_logger = logging.getLogger(__name__)
IS_X_SENDFILE_ENABLED = config['x_sendfile']
SERVER_SOFTWARE = f'{odoo.release.product_name}/{odoo.release.version}'


@contextmanager
def preserve_thread_data() -> Generator[None, None, None]:
    """Context manager to preserve and restore thread-local data used by Odoo.
    """
    current_thread = threading.current_thread()
    attrs_to_preserve = [
        'query_count',
        'query_time',
        'perf_t0',
        'cursor_mode',
        'dbname',
        'uid',
    ]

    saved = {}
    missing = set()

    for attr in attrs_to_preserve:
        if hasattr(current_thread, attr):
            saved[attr] = getattr(current_thread, attr)
        else:
            missing.add(attr)

    try:
        yield
    finally:
        for attr, value in saved.items():
            setattr(current_thread, attr, value)
        for attr in missing:
            if hasattr(current_thread, attr):
                delattr(current_thread, attr)


def generate_environ(path: str) -> WSGIEnvironment:
    """Generate a WSGI environment for the given path.
    This is used to simulate an HTTP request to the Odoo application.
    :param str path: The HTTP request path.
    :return: The WSGI environment dictionary.
    :rtype: WSGIEnvironment
    """
    url, _, query_string = path.partition('?')
    current_environ = request.httprequest.environ
    environ = create_environ(
        method='GET',
        path=url,
        query_string=query_string,
        headers={
            'Host': current_environ['HTTP_HOST'],
            'User-Agent': SERVER_SOFTWARE,
            'http_cookie': current_environ['HTTP_COOKIE'],
            'remote_addr': current_environ['REMOTE_ADDR'],
        }
    )
    return environ


def generate_odoo_http_response(
    request_path: str
) -> Generator[bytes, None, None]:
    """Simulate an internal HTTP GET request to the Odoo WSGI app and yield
    the HTTP response headers and body as bytes.
    The use of it is mainly permitting to call odoo from an inline external
    application, such as a subprocess requesting resources.

    This function preserves the thread-local data used by Odoo to ensure
    that the request is handled correctly without interfering with the
    current thread's state.

    usage example:
    .. code-block:: python

        from odoo.tools.self_request import generate_odoo_http_response

        for chunk in generate_odoo_http_response('/my/request/path'):
            print(chunk.decode())

    :param str request_path: Path to query within the Odoo app.
    :yields: Chunks of the full HTTP response to the simulated request.
    :rtype: Generator[bytes, None, None]
    """

    with preserve_thread_data():
        response_iterable, http_status, http_response_headers = run_wsgi_app(
            root, generate_environ(request_path)
        )

    if IS_X_SENDFILE_ENABLED and "X-Sendfile" in http_response_headers:
        with open(http_response_headers["X-Sendfile"], 'rb') as file:
            now = datetime.now(timezone.utc)
            http_response_status_line_and_headers = (
                f"HTTP/1.1 {http_status}\r\n"
                f"Date: {format_datetime(now, usegmt=True)}\r\n"
                f"Server: {SERVER_SOFTWARE}\r\n"
                f"Content-Length: {os.path.getsize(http_response_headers['X-Sendfile'])}\r\n"
                f"Content-Type: {http_response_headers['Content-Type']}\r\n"
                "\r\n"
            ).encode()

            yield http_response_status_line_and_headers
            yield from file

    else:
        now = datetime.now(timezone.utc)
        http_response_status_line_and_headers = (
            f"HTTP/1.1 {http_status}\r\n"
            f"Date: {format_datetime(now, usegmt=True)}\r\n"
            f"Server: {SERVER_SOFTWARE}\r\n"
            f"Content-Length: {http_response_headers['Content-Length']}\r\n"
            f"Content-Type: {http_response_headers['Content-Type']}\r\n"
            "\r\n"
        ).encode()

        yield http_response_status_line_and_headers
        yield from response_iterable
