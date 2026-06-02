# Part of Odoo. See LICENSE file for full copyright and licensing details.

import contextvars
import datetime as dt
import io
import logging
import os
import os.path
import re
import subprocess as sp
import selectors
import sys
import threading
import time
from collections.abc import Buffer, Sequence
from contextlib import contextmanager
from email.utils import format_datetime
from functools import cache
from io import DEFAULT_BUFFER_SIZE, BytesIO
from typing import BinaryIO, NamedTuple, Literal
from urllib.parse import unquote

import h11

from odoo.http.router import root
from odoo.http.server import SERVER_AGENT, SERVER_SOFTWARE
from odoo.http.server_log import http_log
from odoo.tools.misc import find_in_path

__all__ = ['PaperMuncherServer', '_paper_muncher']

_logger = logging.getLogger(__name__)

DEFAULT_WRITE_TIMEOUT = 15  # seconds
DEFAULT_SERVE_TIMEOUT = 15 * 60  # 15 minutes
DEFAULT_CHUNK_SIZE = 8192  # 8kiB, buffer size of paper-muncher
MAX_INCOMPLETE_EVENT_SIZE = 8192  # 8kiB
FALLBACK_BIN_PATH = '/opt/paper-muncher/bin/paper-muncher'

GET_DOCUMENT_RE = re.compile(br"^/paper-muncher/(\.|[0-9]+\.(?:html|xhtml|xml))$")


class PaperMuncherServer:

    def __init__(self, args, env=None):
        self._args = args
        self._env = env
        self._deadline = None
        self._pdf = None
        self._process = None

        # set in __enter__ and serve
        self._conn = ...
        self._documents = ...
        self._selector = ...

    def __enter__(self):
        if self._process:
            e = "process started already"
            raise RuntimeError(e)
        self._process = sp.Popen(
            self._args,
            stdin=sp.PIPE,
            stdout=sp.PIPE,
            stderr=sp.PIPE,
            env=self._env,
        )
        self._conn = h11.Connection(
            h11.SERVER,
            max_incomplete_event_size=MAX_INCOMPLETE_EVENT_SIZE,
        )
        return self

    def __exit__(self, *_):
        _try_kill_proc(self._process)

    def serve(self, documents: Sequence[str], *, timeout: int = DEFAULT_SERVE_TIMEOUT):
        """Serve Paper Muncher requests until the rendered PDF is returned."""
        if not self._process:
            e = "this function cannot be called outside of the context manager"
            raise RuntimeError(e)

        _logger.info("_serve_requests: Starting request loop, %d documents available", len(documents))
        self._deadline = time.monotonic() + timeout
        self._documents = documents
        self._selector = selectors.DefaultSelector()
        self._selector.register(self._process.stdout, selectors.EVENT_READ, data='stdout')
        self._selector.register(self._process.stderr, selectors.EVENT_READ, data='stderr')

        try:
            while self._pdf is None:
                events = self._poll_events()

                for key, _mask in events:
                    if key.data == 'stderr':
                        self._handle_stderr_message()
                    elif key.data == 'stdout':
                        self._handle_stdout_message()

        except TimeoutError as timeout_error:
            _try_kill_proc(self._process)
            e = f"Paper Muncher exceeded the maximum serve timeout ({timeout}s)"
            raise TimeoutError(e) from timeout_error
        except OSError:
            _try_kill_proc(self._process)
            raise
        finally:
            self._selector.close()

        return self._pdf

    def _poll_events(self):
        exit_code = self._process.poll()
        if exit_code is not None:
            self._drain_stderr()
            raise RuntimeError(
                f"Paper Muncher exited with code {exit_code} before returning the rendered PDF"
            )

        wait_timeout = min(1.0, _remaining_time(self._deadline))
        events = self._selector.select(timeout=wait_timeout)

        # Process has may have exited during select; drain stderr before returning
        # so the caller can see the error output on the next _poll_events call.
        if self._process.poll() is not None:
            self._drain_stderr()

        return events

    def _drain_stderr(self):
        """Read and log any remaining stderr from the paper-muncher process."""
        return
        chunks = []
        fd = self._process.stderr.fileno()
        try:
            while chunk := os.read(fd, 65536):
                chunks.append(chunk)
        except OSError:
            pass
        if chunks:
            _logger.error(
                "paper-muncher (pid %s) stderr:\n%s",
                self._process.pid, b''.join(chunks).decode('utf-8', errors='replace'),
            )

    def _handle_stderr_message(self):
        log_data = os.read(self._process.stderr.fileno(), 65536)
        if not log_data:
            self._selector.unregister(self._process.stderr)
            return
        with open("/tmp/log", "ab") as file:
            file.write(log_data)
        #_logger.warning("paper-muncher (pid %s) wrote on stderr:\n%s",
        #                self._process.pid, log_data.decode('utf-8', errors='replace'))

    def _handle_stdout_message(self):
        self._conn.receive_data(os.read(
            self._process.stdout.fileno(),
            DEFAULT_CHUNK_SIZE,
        ))  # might be an empty bytes, h11 understands them

        request: h11.Request
        body_chunks: list[bytes]

        while True:
            event = self._conn.next_event()
            print(self._conn.states, event)
            if event is h11.NEED_DATA:
                break
            match event:
                case h11.ConnectionClosed():
                    self._selector.unregister(self._process.stdout)
                    break
                case h11.Request():
                    request = event
                    body_chunks = []
                case h11.Data():
                    body_chunks.append(event.data)
                case h11.EndOfMessage():
                    http_log(logging.DEBUG, '[REQ] ', req=request, res=None)
                    body = b''.join(body_chunks)
                    self.dispatch(request, body)
                    self._conn.start_next_cycle()
                case _:
                    e = f"unexpected {event=} in states={self._conn.states=}"
                    raise TypeError(e)

    def _send(self, event) -> None:
        _write_with_timeout(self._process.stdin, self._conn.send(event))

    def _handle_get_document(self, path):
        """Serve one ``GET`` document request from the worker."""
        index = int(path.split('.')[0]) if path != "." else 0
        content = self._documents[index].encode()

        self._send(h11.Response(
            status_code=200,
            headers=[
                ('Date', format_datetime(dt.datetime.now(dt.UTC), usegmt=True)),
                ('Content-Length', str(len(content))),
                ('Content-Type', 'text/html; charset=utf-8'),
                ('Server', SERVER_SOFTWARE),
            ],
        ))
        with open(f'/tmp/{path.replace("/","_")}', 'wb') as file:
            file.write(content)
            print("---------------------> wrote to", file.name)

        self._send(h11.Data(data=content))
        self._send(h11.EndOfMessage())
        # self._process.stdin.flush()
        _logger.info("Document %s sent successfully", path)

    def _handle_put(self, body: bytes):
        # The PUT is a signal that the PDF is ready; acknowledge it so paper-muncher
        # starts streaming the PDF as raw bytes on stdout right after the exchange.
        self._send(h11.Response(
            status_code=200,
            headers=[
                ('Date', format_datetime(dt.datetime.now(dt.UTC), usegmt=True)),
                ('Server', SERVER_SOFTWARE),
            ],
        ))
        self._send(h11.EndOfMessage())
        # self._process.stdin.flush()
        self._process.stdin.close()

        # Collect: body (older protocol variants), bytes h11 buffered from the same
        # read as the PUT headers, then whatever is still incoming on stdout.
        pdf_chunks = [body] if body else []
        leftover = bytes(self._conn._receive_buffer)
        if leftover:
            pdf_chunks.append(leftover)
        pdf_chunks.extend(self._drain_stdout())

        pdf = b''.join(pdf_chunks)
        if not pdf.startswith(b'%PDF-'):
            _logger.error(
                "Paper Muncher (pid %s) returned %d bytes of non-PDF content: %r",
                self._process.pid, len(pdf), pdf[:256],
            )
            raise RuntimeError("Paper Muncher did not return valid PDF content")

        self._pdf = pdf

    def _drain_stdout(self) -> list[bytes]:
        """Read all remaining bytes from stdout until EOF."""
        chunks = []
        fd = self._process.stdout.fileno()
        while True:
            remaining = self._deadline - time.monotonic()
            if remaining <= 0:
                break
            got_stdout = False
            for key, _mask in self._selector.select(timeout=min(1.0, remaining)):
                if key.data != 'stdout':
                    continue
                got_stdout = True
                chunk = os.read(fd, DEFAULT_CHUNK_SIZE)
                if not chunk:
                    return chunks
                chunks.append(chunk)
            if not got_stdout and self._process.poll() is not None:
                break
        return chunks

    def dispatch(self, request: h11.Request, body: bytes):
        if request.method == b'GET' and (match := GET_DOCUMENT_RE.match(request.target)):
            x = self._handle_get_document(match[1].decode('ascii'))
            print("GET ok")
            return x
        if request.method == b'PUT' and request.target == b'/paper-muncher':
            x = self._handle_put(body)
            print("PUT ok")
            return x
        with _preserve_thread_data():
            return self._handle_fallback(request, body)

    def _handle_fallback(self, request: h11.Request, body: bytes):
        #ctx = contextvars.copy_context() # FIXME ask karma

        # Heavily inspired from odoo.http.server.HTTPSocket._make_environ
        assert request.target.startswith(b'/'), request.target
        request_uri = request.target.decode('ascii')
        path_quoted, _, query = request_uri.partition('?')
        environ = {
            'REQUEST_METHOD': request.method.decode('ascii'),
            'SCRIPT_NAME': '',
            'PATH_INFO': unquote(path_quoted, 'latin-1'),
            'QUERY_STRING': query,
            'REQUEST_URI': request_uri,
            'RAW_URI': request_uri,
            # PEP-3333 "WSGI"
            # > missing variables should be left out of the environ dict
            # 'REMOTE_ADDR': ...,
            # 'REMOTE_PORT': ...,
            # 'SERVER_NAME': ...,
            # 'SERVER_PORT': ...,
            'SERVER_PROTOCOL': 'HTTP/' + request.http_version.decode('ascii'),
            'SERVER_SOFTWARE': SERVER_SOFTWARE,
            'wsgi.version': (1, 0),
            'wsgi.url_scheme': 'http',
            'wsgi.input': BytesIO(body),
            'wsgi.errors': sys.stderr,
            'wsgi.multithread': False,
            'wsgi.multiprocess': False,
            'wsgi.run_once': False,
        }
        # paper-muncher guarantees that there's no duplicated header name
        headers = {
            'HTTP_' + header.upper().replace(b'-', b'_').decode('ascii'):
                value.decode('latin-1')
            for header, value in request.headers
        }
        if content_type := headers.pop('HTTP_CONTENT_TYPE', ''):
            environ['CONTENT_TYPE'] = content_type
        if content_length := headers.pop('HTTP_CONTENT_LENGTH', ''):
            environ['CONTENT_LENGTH'] = content_length
        environ.update(headers)

        response_status_code = None
        response_headers: dict[bytes, str | bytes] | None = None
        def start_response(status, headers, exc_info=None):
            nonlocal response_status_code, response_headers
            response_status_code = int(status.partition(' ')[0])
            response_headers = {
                header.lower().encode('ascii'): value
                for header, value in headers
            }

        response_body = root(environ, start_response)
        response = None

        try:
            response_headers[b'date'] = format_datetime(dt.datetime.now(dt.UTC), usegmt=True)
            response_headers[b'server'] = SERVER_AGENT
            response_headers.pop(b'connection', None)

            if sendfile_path := response_headers.get('X-Sendfile'):
                response_headers[b'content-length'] = str(os.path.getsize(sendfile_path))
                response = h11.Response(
                    status_code=response_status_code,
                    headers=list(response_headers.items()),
                )
                self._send(response)
                with open(sendfile_path, 'rb') as f:
                    while chunk := f.read(DEFAULT_BUFFER_SIZE):
                        self._send(h11.Data(data=chunk))
            else:
                response = h11.Response(
                    status_code=response_status_code,
                    headers=list(response_headers.items())
                )
                self._send(response)
                for chunk in response_body:
                    self._send(h11.Data(data=chunk))

            self._send(h11.EndOfMessage())
            # self._process.stdin.flush()  # TODO: useful?
        except Exception:
            self._conn.send_failed()
            raise
        finally:
            http_log(logging.INFO, '', req=request, res=response)


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

    :param file_object: Binary stream (must implement :meth:`~io.BaseIO.fileno`).
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

    _logger.debug("sent %d bytes in %.3fs", total_written, time.monotonic() - (deadline - timeout))


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


def _try_kill_proc(process) -> None:
    """Try killing the process, ignore errors."""
    # TODO: kill() is likely doing kill -9, which doesn't warrant a wait and will never fail
    try:
        process.kill()
    except (OSError, sp.SubprocessError):
        _logger.debug("failed to kill PID %s", process.pid, exc_info=True)
    try:
        process.wait()
    except (OSError, sp.SubprocessError):
        _logger.debug("PID %s did not terminate", process.pid, exc_info=True)


class PaperMuncherInfo(NamedTuple):
    state: Literal['ok', 'install']
    bin: str
    version: str


@cache
def _paper_muncher() -> PaperMuncherInfo:
    bin_path = ''
    version = ''
    try:
        try:
            bin_path = find_in_path('paper-muncher')
        except OSError as exc:
            if not os.path.isfile(FALLBACK_BIN_PATH):
                raise RuntimeError("paper-muncher binary not found in PATH") from exc
            bin_path = FALLBACK_BIN_PATH

        result = sp.run([bin_path, '--version'], stdout=sp.PIPE, stderr=sp.DEVNULL)
        if result.returncode != 0:
            raise RuntimeError(f"bad paper-muncher found at {bin_path}")
        version = result.stdout.decode('utf-8', errors='replace').strip()
    except RuntimeError:
        _logger.info("You need paper-muncher to print a pdf version of the reports.",
                     exc_info=_logger.isEnabledFor(logging.DEBUG))
        return PaperMuncherInfo(state='install', bin=bin_path, version=version)

    _logger.info("Will use the paper-muncher binary at %s", bin_path)
    return PaperMuncherInfo(state='ok', bin=bin_path, version=version)
