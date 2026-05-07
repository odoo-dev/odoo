# Part of Odoo. See LICENSE file for full copyright and licensing details.

import datetime as dt
import logging
import os
import os.path
import subprocess as sp
import selectors
import threading
import time
import typing

from collections.abc import Buffer, Generator, Collection
from contextlib import contextmanager
from dataclasses import dataclass, field
from email.utils import format_datetime
from functools import cache, partial
from io import DEFAULT_BUFFER_SIZE
from typing import IO, BinaryIO
from wsgiref.types import WSGIEnvironment

from werkzeug.test import create_environ, run_wsgi_app

import odoo.release
from odoo.http import request
from odoo.http.router import root
from odoo.tools.misc import find_in_path

__all__ = ['Server', 'which_paper_muncher']

_logger = logging.getLogger(__name__)

DEFAULT_READ_TIMEOUT = 15  # seconds
DEFAULT_WRITE_TIMEOUT = 15  # seconds
DEFAULT_SERVE_TIMEOUT = 15 * 60  # 15 minutes
DEFAULT_CHUNK_SIZE = 8192  # 8kiB
FALLBACK_BIN_PATH = '/opt/paper-muncher/bin/paper-muncher'
SERVER_SOFTWARE = f'{odoo.release.product_name}/{odoo.release.version}'

class Server():
    selector: typing.Any #add type and other vars

    def __init__(self, process):
        self.process = process
        self.deadline = None

    def serve(self, documents: Collection[str], *, timeout: int = DEFAULT_SERVE_TIMEOUT):
        """Serve Paper Muncher requests until the rendered PDF is returned."""
        _logger.info("_serve_requests: Starting request loop, %d documents available", len(documents))
        self.deadline = time.monotonic() + timeout
        self.documents = documents
        self.documents_served = set()
        self.pdf_received = False
        self.stdout_buffer = bytearray()
        self.selector = selectors.DefaultSelector()


        # We use a selector to monitor both stdout (requests) and stderr (logs)
        self.selector.register(self.process.stdout, selectors.EVENT_READ, data='stdout')
        self.selector.register(self.process.stderr, selectors.EVENT_READ, data='stderr')

        try:
            while not self.pdf_received:
                #as long as the server is running (PUT not received and no errors)
                events = self._poll_events()

                for key, _mask in events:
                    #answering the messages
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
        # Check if process died
        if self.process.poll() is not None:
            e = "Paper Muncher exited before returning the rendered PDF"
            raise RuntimeError(e)

        # Wait for data on either pipe.
        wait_timeout = min(1.0, _remaining_time(self.deadline))
        return self.selector.select(timeout=wait_timeout)


    def _handle_stderr_message(self):
        log_data = os.read(self.process.stderr.fileno(), 65536)
        if not log_data:
            self.selector.unregister(self.process.stderr)
        _logger.warning("paper-muncher (pid %s) wrote on stderr:\n%s",
                        self.process.pid, log_data.decode('utf-8', errors='replace'))


    def _handle_stdout_message(self):
        # PROCESS REQUESTS: Read chunk from stdout
        chunk = os.read(self.process.stdout.fileno(), DEFAULT_CHUNK_SIZE)
        if not chunk:  # EOF
            return

        self.stdout_buffer.extend(chunk)

        while (request := consume_headers(self.stdout_buffer)) != (None, None):
            # while there is requests in the buffer
            request_line, _headers = request

            method, path = request_line.split(' ')# TODO use partition
            self.route(method, path)

    def _handle_get_asset(self, path):
        """Serve one ``GET`` asset request from the worker."""

        for chunk in _generate_odoo_http_response(path):
            _safe_write(self.process, chunk)

        self.process.stdin.flush()
        _logger.info("Asset %s sent successfully", path)
        return

    def _handle_get_document(self, path):
        """Serve one ``GET`` document request from the worker."""
        index = int(path.split('.')[0]) if path != "." else 0
        content = self.documents[index]
        now = dt.datetime.now(dt.UTC)
        response_headers = (
            b"HTTP/1.1 200 OK\r\n"
            b"Date: %(date)s\r\n"
            b"Content-Length: %(length)d\r\n"
            b"Content-Type: text/html\r\n"
            b"Server: %(server)s\r\n"
            b"\r\n"
        ) % {
            b'length': len(content.encode()),
            b'date': format_datetime(now, usegmt=True).encode(),
            b'server': SERVER_SOFTWARE.encode(),
        }
        _safe_write(self.process, response_headers)
        _safe_write(self.process, content.encode())
        self.process.stdin.flush() # flush should be handled by the router
        _logger.info("Document %s sent successfully", path)
        self.documents_served.add(index)
        return

    def _handle_put(self, body):
        self.pdf_received = len(self.documents_served) >= len(self.documents)
        if not self.pdf_received:
            e = "Paper Muncher returned before we sent everything"
            raise RuntimeError(e)

        self.pdf = _finalize_and_read(self.process, self.stdout_buffer)


# TODO demande de juc: + spécifique en bas, pour le router faire une section
# router(method, path, body)
# petits utilitaires _private
# * des que valeur par default
    #-----------------------------------ROUTER--------------------------------------
    def route(self, method: str, path: str):
        components = path.lstrip('/').split('/')

        def is_document(file: str):
            return file.endswith(('.html', '.xhtml', '.xml')) or file == "."

        match (method, components):
            case ('GET', (file,)) if is_document(file):
                # todo flush body
                return self._handle_get_document(file)
            case ('GET', _):
                return self._handle_get_asset(path)
            case ('PUT', ()):
                # retreive body
                return self._handle_put()
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


def _read_all(
    file_object: IO[bytes],
    *,
    timeout: int = DEFAULT_READ_TIMEOUT,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> bytes:
    """Read from a binary stream until EOF with a global timeout.

    The timeout applies to the whole operation (single deadline), not per chunk.

    :param file_object: Binary stream (must implement :meth:`fileno`).
    :param timeout: Maximum number of seconds.
    :param chunk_size: Maximum bytes per read.
    :raises: When the deadline is reached before EOF.
    """
    fd = file_object.fileno()
    data = bytearray()
    deadline = time.monotonic() + timeout

    with selectors.DefaultSelector() as selector:
        selector.register(fd, selectors.EVENT_READ)
        while selector.select(timeout=_remaining_time(deadline)):
            chunk = os.read(fd, chunk_size)
            if not chunk:
                break
            data.extend(chunk)
        else:
            e = "Timeout while reading data"
            raise TimeoutError(e)
    _logger.debug("elapsed time reading: %.3fs", time.monotonic() - (deadline - timeout))
    return bytes(data)


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


def _generate_environ(path: str) -> WSGIEnvironment:
    """Build a WSGI environ for an internal Odoo GET request."""
    url, _, query_string = path.partition('?')
    current_environ = request.httprequest.environ
    # By security, we forge a request with public user environment.
    # For protected documents, Odoo should provide a URL with an access token.
    return create_environ(
        method='GET',
        path=url,
        query_string=query_string,
        headers={
            'Host': current_environ['HTTP_HOST'],
            'User-Agent': SERVER_SOFTWARE,
            'remote_addr': current_environ['REMOTE_ADDR'],
        },
    )


def _generate_odoo_http_response(request_path: str) -> Generator[bytes, None, None]:
    """Yield a raw HTTP response (headers then body) for an internal Odoo GET.

    If the response provides ``X-Sendfile``, the file is streamed from disk.
    """
    with _preserve_thread_data():
        response_iterable, http_status, http_response_headers = run_wsgi_app(
            root, _generate_environ(request_path),
        )

    if path := http_response_headers.get("X-Sendfile"):
        with open(path, 'rb') as file:
            yield (
                f"HTTP/1.1 {http_status}\r\n"
                f"Date: {format_datetime(dt.datetime.now(dt.UTC), usegmt=True)}\r\n"
                f"Server: {SERVER_SOFTWARE}\r\n"
                f"Content-Length: {os.path.getsize(path)}\r\n"
                f"Content-Type: {http_response_headers['Content-Type']}\r\n"
                "\r\n"
            ).encode()
            yield from iter(partial(file.read, DEFAULT_BUFFER_SIZE), b'')
    else:
        yield (
            f"HTTP/1.1 {http_status}\r\n"
            f"Date: {format_datetime(dt.datetime.now(dt.UTC), usegmt=True)}\r\n"
            f"Server: {SERVER_SOFTWARE}\r\n"
            f"Content-Length: {http_response_headers['Content-Length']}\r\n"
            f"Content-Type: {http_response_headers['Content-Type']}\r\n"
            "\r\n"
        ).encode()
        yield from response_iterable


def consume_headers(buffer: bytearray) -> tuple[str | None, dict[str, str] | None]:
    """Parse and remove an HTTP-like header block from a byte buffer.

    Returns ``(None, None)`` if the full header block has not been received yet.
    """
    # Look for the end of the HTTP headers (double CRLF or double LF)
    headers_end = buffer.find(b'\r\n\r\n')
    sep_len = 4
    if headers_end == -1:
        headers_end = buffer.find(b'\n\n')
        sep_len = 2
        if headers_end == -1:
            return None, None

    headers_data = buffer[:headers_end]
    lines = headers_data.split(b'\n')

    # Strip \r and decode as text
    decoded_lines = [line.strip(b'\r').decode('utf-8', errors='replace') for line in lines]

    request_line = decoded_lines[0] if decoded_lines else ""
    headers = {}

    for line in decoded_lines[1:]:
        if not line:
            continue
        parts = line.split(':', 1)
        if len(parts) == 2:
            headers[parts[0].strip().lower()] = parts[1].strip()

    # Remove the headers and the separator from the buffer
    del buffer[:headers_end + sep_len]

    return request_line, headers


def _consume_body(buffer: bytearray, headers: dict[str, str] | None) -> bytes | None:
    """Consume an HTTP-like body from a byte buffer based on ``Content-Length``.

    Returns ``None`` when the full body is not available yet.
    """
    content_length_header = (headers or {}).get('content-length')
    if not content_length_header:
        return b''

    try:
        content_length = int(content_length_header)
    except (TypeError, ValueError) as exc:
        e = f"Invalid Content-Length header value: {content_length_header!r}"
        raise RuntimeError(e) from exc

    if content_length < 0:
        e = f"Invalid negative Content-Length header value: {content_length}"
        raise RuntimeError(e)

    if len(buffer) < content_length:
        return None

    body = bytes(buffer[:content_length])
    del buffer[:content_length]
    return body



def _finalize_and_read(process, current_buffer):
    """Send the final response, then read stdout/stderr and validate the PDF."""
    final_response = (
                         b"HTTP/1.1 200 OK\r\n"
                         b"Date: %(date)s\r\n"
                         b"Server: %(server)s\r\n"
                         b"\r\n"
                     ) % {
                         b'date': format_datetime(dt.datetime.now(dt.UTC), usegmt=True).encode(),
                         b'server': SERVER_SOFTWARE.encode(),
                     }

    _safe_write(process, final_response)
    process.stdin.flush()
    process.stdin.close()

    if process.poll() is not None:
        e = "Paper Muncher crashed before returning PDF"
        raise RuntimeError(e)


    if not body.startswith(b'%PDF-'):
        e = "Paper Muncher did not return valid PDF content"
        raise RuntimeError(e)

    return rendered_content


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
