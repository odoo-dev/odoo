# Part of Odoo. See LICENSE file for full copyright and licensing details.

import datetime as dt
import h11
import io
import logging
import os
import os.path
import subprocess as sp
import selectors
import sys
import threading
import time

from collections.abc import Buffer, Collection
from contextlib import contextmanager
from email.utils import format_datetime
from functools import cache, partial
from io import DEFAULT_BUFFER_SIZE
from typing import BinaryIO
from urllib.parse import unquote, urlsplit


import odoo.release
from odoo.http import request
from odoo.http.router import root
from odoo.tools.misc import find_in_path

__all__ = ['Server', 'which_paper_muncher']

_logger = logging.getLogger(__name__)

DEFAULT_WRITE_TIMEOUT = 15  # seconds
DEFAULT_SERVE_TIMEOUT = 15 * 60  # 15 minutes
DEFAULT_CHUNK_SIZE = 8192  # 8kiB
MAX_INCOMPLETE_EVENT_SIZE = 8192  # 8kiB
FALLBACK_BIN_PATH = '/opt/paper-muncher/bin/paper-muncher'
SERVER_SOFTWARE = f'{odoo.release.product_name}/{odoo.release.version}'


class Server():

    def __init__(self, process):
        self.process = process
        self.deadline = None

        self.conn = h11.Connection(
            h11.SERVER,
            max_incomplete_event_size=MAX_INCOMPLETE_EVENT_SIZE,
        )

    def serve(self, documents: Collection[str], *, timeout: int = DEFAULT_SERVE_TIMEOUT):
        """Serve Paper Muncher requests until the rendered PDF is returned."""
        _logger.info("_serve_requests: Starting request loop, %d documents available", len(documents))
        self.deadline = time.monotonic() + timeout
        self.documents = documents
        self.documents_served = set()
        self.pdf_received = False
        self._current_request = None
        self._body_chunks = []
        self.selector = selectors.DefaultSelector()

        self.selector.register(self.process.stdout, selectors.EVENT_READ, data='stdout')
        self.selector.register(self.process.stderr, selectors.EVENT_READ, data='stderr')

        try:
            while not self.pdf_received:
                events = self._poll_events()

                for key, _mask in events:
                    if key.data == 'stderr':
                        self._handle_stderr_message()
                    elif key.data == 'stdout':
                        self._handle_stdout_message()

        except TimeoutError as timeout_error:
            _try_kill_proc(self.process)
            e = (
                f"Paper Muncher exceeded the maximum serve timeout ({timeout}s) "
                f"after serving {len(self.documents_served)}/{len(self.documents)} document(s)."
            )
            raise TimeoutError(e) from timeout_error
        finally:
            self.selector.close()

    def _poll_events(self):
        if self.process.poll() is not None:
            e = "Paper Muncher exited before returning the rendered PDF"
            raise RuntimeError(e)

        wait_timeout = min(1.0, _remaining_time(self.deadline))
        return self.selector.select(timeout=wait_timeout)

    def _handle_stderr_message(self):
        log_data = os.read(self.process.stderr.fileno(), 65536)
        if not log_data:
            self.selector.unregister(self.process.stderr)
        _logger.warning("paper-muncher (pid %s) wrote on stderr:\n%s",
                        self.process.pid, log_data.decode('utf-8', errors='replace'))

    def _handle_stdout_message(self):
        chunk = os.read(self.process.stdout.fileno(), DEFAULT_CHUNK_SIZE)
        if not chunk:
            return

        self.conn.receive_data(chunk)

        while True:
            event = self.conn.next_event()
            if event is h11.NEED_DATA or event is h11.PAUSED:
                break
            if isinstance(event, h11.Request):
                self._current_request = event
                self._body_chunks = []
            elif isinstance(event, h11.Data):
                self._body_chunks.append(event.data)
            elif isinstance(event, h11.EndOfMessage):
                body = b''.join(self._body_chunks)
                self.route(
                    self._current_request.method.decode(),
                    self._current_request.target.decode(),
                    body,
                )
                self.conn.start_next_cycle()
            elif isinstance(event, h11.ConnectionClosed):
                break

    def _send(self, event) -> None:
        _safe_write(self.process, self.conn.send(event))

    def _handle_get_document(self, path):
        """Serve one ``GET`` document request from the worker."""
        index = int(path.split('.')[0]) if path != "." else 0
        content = self.documents[index].encode()

        self._send(h11.Response(
            status_code=200,
            headers=[
                ("Date", format_datetime(dt.datetime.now(dt.UTC), usegmt=True)),
                ("Content-Length", str(len(content))),
                ("Content-Type", "text/html"),
                ("Server", SERVER_SOFTWARE),
            ],
        ))
        self._send(h11.Data(data=content))
        self._send(h11.EndOfMessage())
        self.process.stdin.flush()
        _logger.info("Document %s sent successfully", path)
        self.documents_served.add(index)

    def _handle_get_asset(self, path):
        """Serve one ``GET`` asset request from the worker."""
        with _preserve_thread_data():
            body_iter, http_status, resp_headers = _call_wsgi(_make_environ(path))
            status_code = int(http_status.split(' ', 1)[0])

            if sendfile_path := resp_headers.get("X-Sendfile"):
                self._send(h11.Response(status_code=status_code, headers=[
                    ("Date", format_datetime(dt.datetime.now(dt.UTC), usegmt=True)),
                    ("Server", SERVER_SOFTWARE),
                    ("Content-Length", str(os.path.getsize(sendfile_path))),
                    ("Content-Type", resp_headers["Content-Type"]),
                ]))
                with open(sendfile_path, "rb") as f:
                    for chunk in iter(partial(f.read, DEFAULT_BUFFER_SIZE), b""):
                        self._send(h11.Data(data=chunk))
            else:
                self._send(h11.Response(status_code=status_code, headers=[
                    ("Date", format_datetime(dt.datetime.now(dt.UTC), usegmt=True)),
                    ("Server", SERVER_SOFTWARE),
                    ("Content-Length", resp_headers["Content-Length"]),
                    ("Content-Type", resp_headers["Content-Type"]),
                ]))
                for chunk in body_iter:
                    self._send(h11.Data(data=chunk))

        self._send(h11.EndOfMessage())
        self.process.stdin.flush()
        _logger.info("Asset %s sent successfully", path)

    def _handle_put(self, body: bytes):
        if len(self.documents_served) < len(self.documents):
            raise RuntimeError("Paper Muncher returned before we sent everything")

        if not body.startswith(b'%PDF-'):
            raise RuntimeError("Paper Muncher did not return valid PDF content")

        self._send(h11.Response(
            status_code=200,
            headers=[
                ("Date", format_datetime(dt.datetime.now(dt.UTC), usegmt=True)),
                ("Server", SERVER_SOFTWARE),
            ],
        ))
        self._send(h11.EndOfMessage())
        self.process.stdin.flush()
        self.process.stdin.close()

        self.pdf = body
        self.pdf_received = True

    def route(self, method: str, path: str, body: bytes):
        components = path.lstrip('/').split('/')

        def is_document(file: str):
            return file.endswith(('.html', '.xhtml', '.xml')) or file == "."

        match (method, components):
            case ('GET', (file,)) if is_document(file):
                return self._handle_get_document(file)
            case ('GET', _):
                return self._handle_get_asset(path)
            case ('PUT', _):
                return self._handle_put(body)
            case _:
                e = f"Unsupported paper-muncher request: method={method!r}, path={path!r}"
                raise RuntimeError(e)


def _remaining_time(deadline: float) -> float:
    """Return remaining seconds until a monotonic deadline.

    :param deadline: Absolute timestamp from :func:`time.monotonic`.
    :raises TimeoutError: When the deadline has been reached.
    """
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError
    return remaining


def _write_with_timeout(
        file_object: BinaryIO,
        data: Buffer,
        *,
        timeout: int = DEFAULT_WRITE_TIMEOUT,
) -> None:
    """Write all bytes to a binary stream with a global timeout.

    :param file_object: Binary stream (must implement :meth:`fileno`).
    :param data: Bytes to write.
    :param timeout: Maximum number of seconds.

    :raises TimeoutError: When the deadline is reached before completion.
    :raises RuntimeError: When 0 bytes are written while data remains.
    """
    fd = file_object.fileno()
    memview = memoryview(data)
    total_written = 0
    deadline = time.monotonic() + timeout

    with selectors.DefaultSelector() as selector:
        selector.register(fd, selectors.EVENT_WRITE)

        while total_written < len(data):
            events = selector.select(timeout=_remaining_time(deadline))
            if not events:
                e = "Timeout exceeded while writing to subprocess"
                raise TimeoutError(e)

            written = os.write(fd, memview[total_written:])
            if written == 0:
                e = "Write returned zero bytes"
                raise RuntimeError(e)
            total_written += written

    _logger.debug("elapsed time writing: %.3fs", time.monotonic() - (deadline - timeout))


@contextmanager
def _preserve_thread_data():
    """Preserve and restore a subset of Odoo thread-local attributes."""
    current_thread = threading.current_thread()
    attrs_to_preserve = [
        'cursor_mode',
        'dbname',
        'perf_t0',
        'query_count',
        'query_time',
        'rpc_model_method',
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


def _make_environ(path: str) -> dict:
    """Build a WSGI environ for an internal Odoo GET request as a public user.

    Protected resources must carry an access token in the URL; this function
    deliberately omits session cookies so the request is treated as public.
    """
    parsed = urlsplit(path)
    path_info = unquote(parsed.path, 'latin-1')
    query_string = parsed.query or ''
    request_uri = f'{path_info}?{query_string}' if query_string else path_info
    current_environ = request.httprequest.environ
    return {
        'REQUEST_METHOD': 'GET',
        'SCRIPT_NAME': '',
        'PATH_INFO': path_info,
        'QUERY_STRING': query_string,
        'REQUEST_URI': request_uri,
        'RAW_URI': request_uri,
        'HTTP_HOST': current_environ['HTTP_HOST'],
        'HTTP_USER_AGENT': SERVER_SOFTWARE,
        'REMOTE_ADDR': current_environ['REMOTE_ADDR'],
        'SERVER_NAME': current_environ['SERVER_NAME'],
        'SERVER_PORT': current_environ['SERVER_PORT'],
        'SERVER_PROTOCOL': 'HTTP/1.1',
        'SERVER_SOFTWARE': SERVER_SOFTWARE,
        'wsgi.version': (1, 0),
        'wsgi.url_scheme': current_environ.get('wsgi.url_scheme', 'http'),
        'wsgi.input': io.BytesIO(),
        'wsgi.errors': sys.stderr,
        'wsgi.multithread': True,
        'wsgi.multiprocess': False,
        'wsgi.run_once': False,
    }


def _call_wsgi(environ: dict) -> tuple:
    """Call Odoo's WSGI root app; return (body_iter, status_str, headers_dict)."""
    result = {}

    def start_response(status, response_headers, exc_info=None):
        result['status'] = status
        result['headers'] = dict(response_headers)

    body_iter = root(environ, start_response)
    return body_iter, result['status'], result['headers']


def _safe_write(process, data: bytes) -> None:
    """Write to the worker stdin, killing the process if the write times out."""
    try:
        _write_with_timeout(process.stdin, data)
    except TimeoutError:
        _try_kill_proc(process)
        raise


def _try_kill_proc(process) -> None:
    """Try killing the process, ignore errors."""
    try:
        process.kill()
    except (OSError, sp.SubprocessError):
        _logger.debug("failed to kill PID %s", process.pid, exc_info=True)
    try:
        process.wait()
    except (OSError, sp.SubprocessError):
        _logger.debug("PID %s did not terminate", process.pid, exc_info=True)


@cache
def which_paper_muncher() -> os.PathLike:
    f""" Look for the paper-muncher binary in PATH or at {FALLBACK_BIN_PATH}. """
    try:
        bin_path = find_in_path('paper-muncher')
    except OSError as exc:
        if not os.path.isfile(FALLBACK_BIN_PATH):
            e = "paper-muncher binary not found in PATH"
            raise RuntimeError(e) from exc
        bin_path = FALLBACK_BIN_PATH

    try:
        sp.run(
            [bin_path, '--version'],
            stdout=sp.PIPE,
            stderr=sp.DEVNULL,
            check=True,
        )
    except (OSError, sp.CalledProcessError) as exc:
        e = f"bad paper-muncher found at {bin_path}"
        raise RuntimeError(e) from exc

    return bin_path


try:
    _bin_path = which_paper_muncher()
except RuntimeError:
    _logger.error("Error finding the paper-muncher binary.",
        exc_info=_logger.isEnabledFor(logging.DEBUG))
else:
    _logger.info("Found paper-muncher binary at %s", _bin_path)
    del _bin_path