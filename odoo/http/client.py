from __future__ import annotations

import io
import logging
import pprint
import re
import sys
import threading
import time
import typing
from functools import partial
from collections.abc import Buffer
from http import HTTPStatus
from urllib.parse import unquote
from wsgiref.handlers import format_date_time
from wsgiref.simple_server import sys_version

from urllib3.util import parse_url
from werkzeug.exceptions import default_exceptions as werkzeug_exceptions
from werkzeug.middleware.proxy_fix import ProxyFix

import odoo
import odoo.release
from odoo.netsvc import (
    BOLD_SEQ,
    COLOR_PATTERN,
    CYAN,
    DEFAULT,
    GREEN,
    MAGENTA,
    RED,
    RESET_SEQ,
    YELLOW,
    ColoredFormatter,
)
from odoo.tools import config, lazy, real_time
from odoo.tools.misc import humanint

from .router import root

if typing.TYPE_CHECKING:
    import socket

_logger = logging.getLogger(__name__)

BUFFER_SIZE = 1 << 15
MAX_LINE_LENGTH = 8002  # 8k + '\r\n'
SERVER_AGENT = ' '.join((
    f'odoo/{odoo.release.series}',
    sys_version,
)).encode()

RE_START_LINE = re.compile(rb"([A-Z]+) (.*?)(?:\?(.*))? HTTP/(\d\.\d)$")
TOKEN = rb'[-!#$%&\'*+.^_`|~0-9a-zA-Z]+'
RE_TOKEN = re.compile(TOKEN)
RE_HEADER = re.compile(rb'(%s):\s*(.*)\s*$' % TOKEN, re.IGNORECASE)
RE_CHUNK = re.compile(r'(Psize?[0-9A-F])(\s*;\s*%s(\s*=\s*.?+))*')


class HTTPClient:
    def __init__(self, client_sock: socket.socket, client_addr, *, prelude=b''):
        self.sock = client_sock
        self.addr = client_addr
        self.ip = client_addr[0]

        self.buffer = ReadBuffer(BUFFER_SIZE, prelude)
        self.ready: bool = False
        self.method: str = ""
        self.target: str = ""
        self._query: bytes = b""
        self.http_version: typing.Literal['1.1', '1.0', ''] = ''
        self.headers: dict[str, bytes] = {}
        self.raw_cookies: bytes = b''
        self.body: RequestBody = _EMPTY_BODY

        self._request_line = None
        self.chunked_response = False

    def _make_environ(self):
        # h11 made sure the target, http_version, header names and
        # content-length only contain valid ascii characters. It didn't
        # verified any other header value as HTTP (RFC9110) states they
        # can be "opaque" data. Decoding them as latin-1 gives the
        # correct string for US-ASCII and ISO-8859-1 which are the two
        # commonly used charset for header values. Using latin-1 doesn't
        # break RFC2047/RFC5987/RFC8187-encoding (base64 or %-encoding)
        # and just leaves the string unparsed. HTTP headers that use
        # other (non-standard) charsets are passed to the application as
        # latin-1 string and must be re-encoded by the application. This
        # is in line with the WSGI spec.

        h11request = self
        *_, path_info, query_string, _ = parse_url(h11request.target)
        environ = {
            'REQUEST_METHOD': h11request.method,
            'SCRIPT_NAME': '',
            'PATH_INFO': path_info,
            'QUERY_STRING': query_string or '',
            'REMOTE_ADDR': self.addr[0],
            'REMOTE_PORT': self.addr[1],
            'SERVER_NAME': config['http_interface'],
            'SERVER_PORT': config['http_port'],
            'SERVER_PROTOCOL': 'HTTP/' + h11request.http_version,
            'SERVER_SOFTWARE': SERVER_AGENT,
            'wsgi.version': (1, 0),
            'wsgi.url_scheme': 'http',
            'wsgi.input': h11request.body,
            'wsgi.errors': sys.stderr,
            'wsgi.multithread': not config['workers'] and not odoo.evented,
            'wsgi.multiprocess': config['workers'] and not odoo.evented,
            'wsgi.run_once': False,
        }
        if environ['wsgi.multithread']:
            environ['odoo.socket'] = self.sock
            environ['odoo.prelude'] = lambda: memoryview(self.buffer)

        environ.update({
            'HTTP_' + header.upper().replace('-', '_'): value.decode('latin-1')
            for header, value in h11request.headers.items()
        })
        if self.raw_cookies:
            environ['HTTP_COOKIE'] = self.raw_cookies.decode('latin-1')
        if content_type := environ.pop('HTTP_CONTENT_TYPE', ''):
            environ['CONTENT_TYPE'] = content_type
        if content_length := environ.pop('HTTP_CONTENT_LENGTH', ''):
            environ['CONTENT_LENGTH'] = content_length

        if config['proxy_mode'] and environ.get('HTTP_X_FORWARDED_HOST'):
            pf = ProxyFix(lambda environ, start_response: (), x_for=1, x_proto=1, x_host=1)
            pf(environ, lambda status, headers: None)  # it updates environ
            self.ip = environ['REMOTE_ADDR']

        return environ

    def serve(self):
        t0 = real_time()
        current_thread = threading.current_thread()
        current_thread.query_count = 0
        current_thread.query_time = 0
        current_thread.perf_t0 = t0
        current_thread.cursor_mode = None

        # Read the header
        try:
            assert not self.ready
            while True:
                self._receive_data()
                if self.ready:
                    break
                buf = self.buffer
                nbytes = self.sock.recv_into(buf.write_buffer())
                buf.written(nbytes)
        except Exception as exc:
            try:
                self.sock.sendall(ResponseHeader(
                    status_code=HTTPStatus.BAD_REQUEST,
                    http_version=self.http_version,
                    headers=[
                        (b'connection', b'close'),
                        (b'content-length', b'0'),
                    ],
                ))
                http_log(_logger, logging.INFO, '', extra={
                    'remote_addr': self.ip,
                    'http_request_line': '"- - HTTP/?"',
                    'http_response_status': HTTPStatus.BAD_REQUEST,
                    'http_response_body': 0,
                    'query_count': 0,
                    'query_time': 0,
                    'remaining_time': real_time() - t0 - current_thread.query_time,
                }, exc_info=_logger.isEnabledFor(logging.DEBUG))
                self.sock.close()
            except BrokenPipeError:
                _logger.debug("broken pipe")
            return

        # Craft the WSGI environ
        wsgi_environ = self._make_environ()
        self._request_line = ('"%s %s HTTP/%s"' % (
            self.method,
            self.target,
            self.http_version,
        ))

        expectation = self.headers.get('expect')
        if expectation == b'100-continue':
            self.sock.sendall(bytes(ResponseHeader(
                status=str(HTTPStatus.CONTINUE),
                http_version=self.http_version,
            )))
            http_log(_logger, logging.DEBUG, '[100] ', extra={
                'remote_addr': self.ip,
                'http_request_line': self._request_line,
                'http_response_status': 100,
                'http_response_body': 0,
                'query_count': 0,
                'query_time': 0,
                'remaining_time': real_time() - t0,
            })

        # Pass the request into the WSGI application. It'll call our
        # start_response() with the http response line and headers, then
        # return an iterable object containing the body.
        http_log(_logger, logging.DEBUG, '[REQ] ', extra={
            'remote_addr': self.ip,
            'http_request_line': self._request_line,
            'query_count': 0,
            'query_time': 0,
            'remaining_time': real_time() - t0,
        })
        wsgi_response = root(wsgi_environ, self.start_response)

        # Iter over the iterable object the WSGI application gave us. It
        # contains the body that we are yet to send on the network.
        bytes_sent = 0
        response_iter = iter(wsgi_response)
        while True:
            try:
                chunk = next(response_iter)
                if not chunk:
                    continue
            except StopIteration:
                break
            except Exception as exc:  # noqa: BLE001
                # aborting, cannot read next bytes to send
                http_log(_logger, logging.ERROR, '[END] ', extra={
                    'remote_addr': self.ip,
                    'http_request_line': self._request_line,
                    'http_response_body': bytes_sent,
                    'query_count': current_thread.query_count,
                    'query_time': current_thread.query_time,
                    'remaining_time': real_time() - t0 - current_thread.query_time,
                    'cursor_mode': current_thread.cursor_mode,
                }, exc_info=exc)
                self.sock.close()
                return

            if self.chunked_response:
                chunk_head = str(len(chunk)).encode() + b'\r\n'
                self.sock.sendall(chunk_head)
                self.sock.sendall(chunk)
                self.sock.sendall(b'\r\n')
                bytes_sent += len(chunk) + len(chunk_head) + 2
            else:
                self.sock.sendall(chunk)
                bytes_sent += len(chunk)
        if self.chunked_response:
            self.sock.sendall(b'0\r\n\r\n')
            bytes_sent += 5
        self.body = None  # remove reference
        if hasattr(wsgi_response, 'close'):
            # if we switched protocol, we had no body and the remaining connection
            # is handled on close... in any case, closing here
            wsgi_response.close()
        self.sock.close()
        http_log(_logger, logging.DEBUG, '[END] ', extra={
            'remote_addr': self.ip,
            'http_request_line': self._request_line,
            'http_response_body': bytes_sent,
            'query_count': current_thread.query_count,
            'query_time': current_thread.query_time,
            'remaining_time': real_time() - t0 - current_thread.query_time,
            'cursor_mode': current_thread.cursor_mode,
        })

    def _receive_data(self) -> None:
        assert not self.ready

        buf = self.buffer
        # parse the first line
        if not self.method:
            line = buf.read_line(MAX_LINE_LENGTH)
            if line is None:
                return
            m = RE_START_LINE.fullmatch(line)
            if m is None:
                raise HttpSyntaxError("Syntax error in first line")
            method, target, query, http_version = m.groups()
            self.http_version = http_version.decode('ascii')
            if http_version not in (b'1.1', b'1.0'):
                raise ValueError(f"Invalid HTTP version {http_version!r}")
            if target[:1] not in (b'/', b'*'):
                raise ValueError(f"Invalid target {target!r}")
            self.target = unquote(target)
            self.query = query or b''
            self.method = method.decode()

        # parse headers
        while True:
            line = buf.read_line(MAX_LINE_LENGTH)
            if line is None:
                return
            if not line:
                break
            m = RE_HEADER.fullmatch(line)
            if m is None:
                raise HttpSyntaxError("Syntax error in header")
            self._set_header(*m.groups())

        # host is required (resolve it)
        self.host = self.headers['host'].decode('ascii')
        if not self.host:
            raise HttpSyntaxError("missing host header")
        # set the body
        if value := self.headers.get('transfer-encoding'):
            if self.headers.get('content-length'):
                raise HttpSyntaxError("Provided both transfer-encoding and content-length.")
            if value != b'chunked':
                raise NotImplementedError("Only 'chunked' transfer-encoding is supported.")
            self.body = ChunkedBodyReceiver(self)
        elif value := self.headers.get('content-length'):
            size = int(value.decode())
            if size > 0:
                self.body = BodyReceiver(self, size)
        self.ready = True

    def _set_header(self, key: bytes, value: bytes):
        key = key.lower().decode('ascii')
        if key == 'cookie':
            if self.raw_cookies:
                self.raw_cookies += b'; '
            self.raw_cookies += value
            return
        if old_value := self.headers.get(key):
            value = old_value + b', ' + value
        self.headers[key] = value

    def start_response(
        self,
        status: str,
        response_headers: list[tuple[str, str]],
        exc_info=None,
    ):
        if _logger.isEnabledFor(logging.DEBUG):
            _logger.debug("%s\n%s", status, pprint.pformat(response_headers))
        status_code, _, reason = status.partition(' ')
        status_code = HTTPStatus(int(status_code))

        # Do the wsgi-encoding dance back, see _make_environ()
        response_headers: list[tuple[bytes, bytes]] = [
            (header.encode('ascii').lower(), value.encode('latin-1'))
            for header, value in response_headers
        ]

        # Build response
        h11_response = ResponseHeader(
            status=status,
            http_version=self.http_version,
            headers=response_headers,
        )

        # Chunked?
        if h11_response.headers.get(b'transfer-encoding') == b'chunked':
            self.chunked_response = True

        # Protocol switch
        if h11_response.headers.get(b'upgrade'):
            # consume the body
            self.body.readall()
            # TODO
        if (cnx := self.headers.get(b'connection')) is not None:
            if cnx == b'upgrade':
                self.upgrade = self.headers.get(b'upgrade')
                if self.upgrade is None:
                    e = "the Upgrade header is mandatory with Connection: upgrade"
                    raise ValueError(e)
            elif cnx.lower() != b'close':
                e = f"invalid Connection header: {cnx}"
                raise ValueError(e)
        else:
            self.headers[b'connection'] = b'close'

        # Send and log the response
        self.sock.sendall(bytes(h11_response))
        current_thread = threading.current_thread()
        http_log(_logger, logging.INFO, '', extra={
            'remote_addr': self.ip,
            'http_request_line': self._request_line,
            'http_response_status': status_code,
            'http_response_body': 'stream' if self.chunked_response else h11_response.headers.get(b'content-length', 0) ,
            'query_count': current_thread.query_count,
            'query_time': current_thread.query_time,
            'remaining_time': real_time() - current_thread.perf_t0 - current_thread.query_time,
            'cursor_mode': current_thread.cursor_mode,
        })


class HttpSyntaxError(Exception):
    pass


class RequestBody(io.RawIOBase):
    remaining: int
    expected_size: int

    def __init__(self, conn: HTTPClient):
        self._conn = conn

    def readable(self) -> bool:
        return True

    def read(self, size, /):
        if not self.remaining:
            return b''
        if not size or size < 0:
            # read all
            size = self.remaining
            if size < 0:
                # unknown size
                arr = bytearray()
                buf = bytearray(BUFFER_SIZE)
                while nbytes := self.readinto(buf):
                    arr += buf[:nbytes]
                return bytes(arr)
            else:
                offset = 0
                reply = memoryview(bytearray(size))
                while self.remaining:
                    nbytes = self.readinto(reply[offset:])
                    offset += nbytes
                    if not nbytes:
                        # eof
                        reply = reply[:offset]
                        break
                return reply.tobytes()
        else:
            # read up to size bytes
            if size > self.remaining > 0:
                size = self.remaining
            reply = memoryview(bytearray(size))
            nbytes = self.readinto(reply)
            return reply[:nbytes].tobytes()

    def readinto(self, buff):
        raise NotImplementedError


class BodyReceiver(RequestBody):
    def __init__(self, conn, size):
        super().__init__(conn)
        self.expected_size = self.remaining = size

    def readinto(self, buff):
        remaining = self.remaining
        if remaining <= 0:
            return 0  # eof

        if not (buf := self._conn.buffer).empty:
            s = min(len(buff), len(memoryview(buf)), remaining)
            buff[:s] = buf.read(s)
            self.remaining -= s
            return s
        else:
            nbytes = self._conn.sock.recv_into(buff, remaining)
            self.remaining -= nbytes
            return nbytes


_EMPTY_BODY = BodyReceiver(None, 0)


class ChunkedBodyReceiver(RequestBody):
    def __init__(self, conn):
        super().__init__(conn)
        self.__reading: typing.Literal['chunk', 'trailer', 'done'] = 'chunk'
        self.__expected = 0
        self.__expect_blank = False
        self.__data = ReadBuffer(BUFFER_SIZE)
        self.trailer = {}

    @property
    def remaining(self):
        return 0 if self.__reading == 'done' else -1

    @property
    def expected_size(self):
        return -1

    def readinto(self, buff):
        if self.__reading == 'done':
            return 0
        if self.__data.empty:
            self._receive_some()
            if self.__reading == 'done':
                return 0
            if self.__data.empty:
                cb = self._conn.buffer
                cbv = cb.write_buffer()
                n = self._conn.sock.recv_into(cbv)
                cb.written(n)
                self._receive_some()
        view = self.__data.read(len(buff))
        nbytes = len(view)
        buff[:nbytes] = view
        return nbytes

    def _receive_some(self):
        buf = self._conn.buffer
        while self.__reading == 'chunk':
            if self.__expected:
                write_buf = self.__data.write_buffer(self.__expected)
                recv = buf.read(len(write_buf))
                nbytes = len(recv)
                write_buf[:nbytes] = recv
                self.__data.written(nbytes)
                self.__expected -= nbytes
                self.__expect_blank = True
                continue

            line = buf.read_line(MAX_LINE_LENGTH)
            if line is None:
                return
            if self.__expect_blank:
                if line == b'':
                    self.__expect_blank = False
                    continue
                raise HttpSyntaxError("Expected a line return after chunk")
            m = RE_CHUNK.fullmatch(line)
            if not m:
                raise HttpSyntaxError("Syntax error in chunk")

            try:
                size = int(m.group(0), 16)
            except ValueError as e:
                raise HttpSyntaxError("Invalid chunk size") from e
            if size:
                assert size > 0
                self.__expected = size
            else:
                self.__reading = 'trailer'

        while self.__reading == 'trailer':
            line = buf.read_line(MAX_LINE_LENGTH)
            if not line:
                break
            m = RE_HEADER.fullmatch(line)
            if not m:
                raise HttpSyntaxError("Syntax error in trailer")
            key, value = m.groups()
            key = key.decode('ascii').lower()
            value = value.decode()
            self.trailer[key] = value

        self.__reading = 'done'


class ResponseHeader:
    def __init__(self, status: str, http_version: str, headers=()):
        self.status = status
        self.http_version = http_version
        date = format_date_time(time.time()).encode()
        self.headers = {
            b'date': date,
            b'server': SERVER_AGENT,
        }
        self.set_cookies = {}
        for key, value in headers or ():
            if isinstance(key, str):
                key = key.encode('ascii')
            if not isinstance(value, bytes):
                if isinstance(value, str):
                    value = value.encode()
                value = bytes(value)
            if key == b'set-cookie':
                self.set_cookies[len(self.set_cookies)] = value
            elif key in self.headers:
                _logger.warning("Duplicate header %s", key)
            else:
                self.headers[key] = value

    def __bytes__(self):
        assert self.http_version
        if False:
            assert all(
                isinstance(key, bytes)
                and isinstance(value, bytes)
                and RE_HEADER.fullmatch(key + b': ' + value)
                for key, value in self.headers.items()
            )
            assert all(
                name == cookie.name and RE_TOKEN.fullmatch(name)
                for name, cookie in self.set_cookies.items()
            )
        response = [
            b'HTTP/',
            self.http_version.encode(),
            b' ',
            self.status.encode(),
            b'\r\n',
        ]
        for key, value in self.headers.items():
            response.extend((key, b': ', value, b'\r\n'))
        for cookie in self.set_cookies.values():
            #value = cookie.generate_set_cookie()
            value = cookie
            response.extend((b'set-cookie: ', value, b'\r\n'))
        response.append(b'\r\n')
        return b''.join(response)


class ReadBuffer(Buffer):
    __slots__ = ('__buffer', '__pos', '__pos_line', '__until', '__view')

    def __init__(self, size: int, init_bytes: Buffer = b''):
        assert size > 9, 'buffer too small'
        self.__buffer = array = bytearray(size)
        self.__view = memoryview(array)
        self.__pos = self.__until = self.__pos_line = 0

        if init_bytes:
            init_bytes = memoryview(init_bytes)
            bs = len(init_bytes)
            assert bs <= size, f'Init buffer too big ({bs}), capacity {size}'
            array[:bs] = init_bytes
            self.__until = bs

    def write_buffer(self, size_hint: int = -1) -> memoryview:
        view = self.__view
        until = self.__until
        total_size = len(self.__buffer)
        if not (0 < size_hint < total_size):
            size_hint = total_size // 4
        if until + size_hint > total_size:
            # re-align
            pos = self.__pos
            if pos > 0:
                cur_size = until - pos
                view[:cur_size] = view[pos:until]
                self.__pos = self.__pos_line = 0
                self.__until = until = cur_size
            elif until >= total_size:
                raise BufferError("buffer full")

        return view[until:]

    def written(self, count: int) -> None:
        self.__until += count

    @property
    def empty(self) -> bool:
        return self.__pos == self.__until

    @property
    def full(self) -> bool:
        return self.__pos == 0 and self.__until == len(self.__buffer)

    def __buffer__(self, flags):
        return self.__view[self.__pos : self.__until]

    def read_line(self, limit: int = 10**6) -> memoryview | None:
        pos = self.__pos
        until = min(pos + limit, self.__until)
        # find CR? LF
        buf = self.__buffer
        lf = buf.find(b'\n', self.__pos_line, until)
        if lf < 0:
            if until != self.__until:
                raise BufferError("limit reached")
            self.__pos_line = self.__until - 1 if self.__until > 0 else 0
            return None
        self.__pos = self.__pos_line = lf + 1
        cr = lf - 1
        if not (cr >= 0 and buf[cr] == 13):
            cr = lf
        return self.__view[pos:cr]

    def read(self, nbytes: int = -1) -> memoryview:
        pos = self.__pos
        count = self.__until - pos
        if 0 < nbytes < count:
            count = nbytes
        self.__pos += count
        self.__pos_line = self.__pos
        return self.__view[pos : pos + count]

    def __repr__(self):
        return f"ReadBuffer({self.__pos}-{self.__until}, size: {len(self.__buffer)})"

#
# Logging
#

_HTTP_EXTRA = {
    'remote_addr': '-',
    'http_request_line': '"- - -"',
    'http_response_status': '-',
    'http_response_body': '-',
    'query_count': '-',
    'query_time': '-',
    'remaining_time': '-',
    'cursor_mode': '-',
}
_HTTP_FORMAT = '%(' + ')s %('.join(_HTTP_EXTRA) + ')s'


def _colorize_request_line(request_line: str, status: int) -> str:
    if status == 200:
        return request_line
    status = HTTPStatus(status)
    if status.is_informational or status.is_success:
        return f'{BOLD_SEQ}{request_line}{RESET_SEQ}'
    if status == HTTPStatus.NOT_MODIFIED:
        return COLOR_PATTERN % (30 + CYAN, 40 + DEFAULT, request_line)
    if status.is_redirection:
        return COLOR_PATTERN % (30 + GREEN, 40 + DEFAULT, request_line)
    if status == HTTPStatus.NOT_FOUND:
        return COLOR_PATTERN % (30 + YELLOW, 40 + DEFAULT, request_line)
    if status.is_client_error:
        return BOLD_SEQ + COLOR_PATTERN % (30 + RED, 40 + DEFAULT, request_line)
    return BOLD_SEQ + COLOR_PATTERN % (30 + MAGENTA, 40 + DEFAULT, request_line)


def _colorize_range(value: float, format: str, low: float, high: float):
    if value > high:
        return COLOR_PATTERN % (30 + RED, 40 + DEFAULT, format % value)
    if value > low:
        return COLOR_PATTERN % (30 + YELLOW, 40 + DEFAULT, format % value)
    return format % value


_colorize_query_count = partial(_colorize_range, format='%d', low=100, high=1000)
_colorize_query_time = partial(_colorize_range, format='%.3f', low=.1, high=3)
_colorize_remaining_time = partial(_colorize_range, format='%.3f', low=1, high=5)


def _colorize_body_length(body_length):
    if body_length == '-':
        return body_length
    if body_length == 'stream':
        return COLOR_PATTERN % (30 + YELLOW, 40 + DEFAULT, body_length)
    return _colorize_range(humanint(body_length), '%s', low=1 << 14, high=1 << 22)
    #                                                       16kiB         4MiB


def _colorize_cursor_mode(cursor_mode: typing.Literal['ro', 'rw', 'ro->rw']) -> str:
    cursor_mode_color = (
             RED    if cursor_mode == 'ro->rw'  # noqa: E272
        else YELLOW if cursor_mode == 'rw'
        else GREEN
    )
    return COLOR_PATTERN % (30 + cursor_mode_color, 40 + DEFAULT, cursor_mode)


@lazy
def _has_color():
    return any(
        isinstance(handler.formatter, ColoredFormatter)
        for handler
        in logging.root.handlers
    )


def http_log(logger, level, msg, *args, **kwargs):
    extra = kwargs['extra'] = _HTTP_EXTRA | kwargs.get('extra', {})
    if _has_color:
        extra['query_count'] = _colorize_query_count(extra['query_count'])
        extra['query_time'] = _colorize_query_time(extra['query_time'])
        extra['remaining_time'] = _colorize_remaining_time(extra['remaining_time'])
        if extra['http_response_status'] != '-':
            extra['http_request_line'] = _colorize_request_line(
                extra['http_request_line'], extra['http_response_status'])
        if extra['cursor_mode'] != '-':
            extra['cursor_mode'] = _colorize_cursor_mode(extra['cursor_mode'])
        extra['http_response_body'] = _colorize_body_length(extra['http_response_body'])
    else:
        extra['query_time'] = round(extra['query_time'], 3)
        extra['remaining_time'] = round(extra['remaining_time'], 3)
        if extra['http_response_body'] not in ('-', 'stream'):
            extra['http_response_body'] = str(humanint(extra['http_response_body']))
    msg += _HTTP_FORMAT % extra
    logger.log(level, msg, *args, **kwargs)