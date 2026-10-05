"""Throwaway per-class aggregation of SQL query templates and safe_eval checker fallbacks."""
import logging
import re
import sys

from odoo import sql_db
from odoo.models import BaseModel
from odoo.tools.safe_eval import runtime

_logger = logging.getLogger(__name__)
_se_logger = logging.getLogger('odoo.tests.se_probe')

TOP = 5
MIN_QUERIES = 100
MIN_FALLBACKS = 20
MIN_FALLBACK_SECS = 0.05
MAX_TEMPLATES = 100_000
_NORMALIZE = [
    (re.compile(r"'(?:[^']|'')*'"), '?'),
    (re.compile(r'%\(\w+\)s|%s|(?<![\w.$])\d+(?:\.\d+)?\b'), '?'),
    (re.compile(r'\(\s*\?(?:\s*,\s*\?)*\s*\)'), '(?)'),
    (re.compile(r'\(\?\)(?:\s*,\s*\(\?\))+'), '(?)'),
    (re.compile(r'ARRAY\s*\[[?,\s]*\]', re.IGNORECASE), 'ARRAY[?]'),
    (re.compile(r'\s+'), ' '),
]
_SAFE_EVAL_DIR = runtime.__file__.rsplit('/', 1)[0] + '/'

_templates = {}
_cls = None
_queries = {}
_seen = set()
_fallbacks = {}


def start():
    """Install the query and safe_eval hooks once, never raising."""
    try:
        if sql_db.query_probe_hook is None:
            sql_db.query_probe_hook = _on_query
            runtime.check_fallback_hook = _on_fallback
    except Exception:  # noqa: BLE001
        _disable()


def enter(cls):
    """Attribute what follows to ``cls``, logging the previous class when it changes."""
    global _cls  # noqa: PLW0603
    if cls is _cls:
        return
    try:
        if _cls is not None:
            _report(f'{_cls.__module__}.{_cls.__qualname__}')
    except Exception:  # noqa: BLE001
        _disable()
    _cls = cls
    _queries.clear()
    _seen.clear()
    _fallbacks.clear()


def _disable():
    _logger.warning("query probe disabled", exc_info=True)  # noqa: LOG014
    sql_db.query_probe_hook = runtime.check_fallback_hook = None


def _template(query):
    text = query.decode(errors='replace') if isinstance(query, bytes) else query
    for pattern, repl in _NORMALIZE:
        text = pattern.sub(repl, text)
    return text.strip()


def _on_query(cr, query, params, delay):
    if _cls is not None:
        try:
            _record_query(cr, query, params, delay)
        except Exception:  # noqa: BLE001
            _disable()


def _record_query(cr, query, params, delay):
    if not isinstance(query, (str, bytes)):
        query = query.as_string(cr._obj)
    tpl = _templates.get(query)
    if tpl is None:
        if len(_templates) > MAX_TEMPLATES:
            _templates.clear()
        tpl = _templates[query] = _template(query)
    stat = _queries.get(tpl)
    if stat is None:
        stat = _queries[tpl] = [0, 0, 0, 0.0]
    stat[0] += 1
    stat[3] += delay
    if params:
        n_int = 0
        single = has_list = False
        for p in params.values() if isinstance(params, dict) else params:
            if type(p) in (tuple, list):
                has_list = True
                if len(p) == 1:
                    single = True
                    break
            elif type(p) is int:
                n_int += 1
        if single or (not has_list and n_int == 1):
            stat[1] += 1
    key = hash((tpl, repr(params)))
    if key in _seen:
        stat[2] += 1
    else:
        _seen.add(key)


def _on_fallback(error, visited, duration):
    if _cls is not None:
        try:
            _record_fallback(sys._getframe(2), error, visited, duration)
        except Exception:  # noqa: BLE001
            _disable()


def _record_fallback(frame, error, visited, duration):
    model = ''
    for _depth in range(30):
        if frame is None:
            break
        if isinstance(this := frame.f_locals.get('self'), BaseModel):
            model = f' {this._name}'
        filename = frame.f_code.co_filename
        if filename[:1] == '/' and not filename.startswith(_SAFE_EVAL_DIR):
            break
        frame = frame.f_back
    else:
        frame = None
    site = 'unknown'
    if frame is not None:
        path = '/'.join(filename.rsplit('/', 3)[-3:])
        site = f'{path}:{frame.f_lineno} {frame.f_code.co_name}{model}'
    reason = f'{type(error).__name__}({str(error)[:60]!r})'
    stat = _fallbacks.get((site, reason))
    if stat is None:
        stat = _fallbacks[site, reason] = [0, 0, 0.0]
    stat[0] += 1
    stat[1] += visited
    stat[2] += duration


def _report(name):
    top = sorted(_queries.items(), key=lambda item: -item[1][0])[:TOP]
    for tpl, (n, single, dup, secs) in top:
        if n >= MIN_QUERIES:
            _logger.info(
                "class=%s n=%d single=%d dup=%d ms=%.0f tpl=%s", name, n, single, dup, secs * 1000, tpl[:300],
            )
    top = sorted(_fallbacks.items(), key=lambda item: -item[1][2])[:TOP]
    for (site, reason), (n, visited, secs) in top:
        if n >= MIN_FALLBACKS or secs >= MIN_FALLBACK_SECS:
            _se_logger.info(
                "class=%s n=%d visited=%d ms=%.0f reason=%s site=%s", name, n, visited, secs * 1000, reason, site,
            )
