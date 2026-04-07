# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import os
import os.path
import subprocess
from collections.abc import Mapping, Sequence
from functools import cache

from odoo.tools.misc import find_in_path

from .communication import _serve_requests, make_multi_docs_html, partition_on_body

_logger = logging.getLogger(__name__)
FALLBACK_BIN_PATH = '/opt/paper-muncher/bin/paper-muncher'


def run_paper_muncher(
    paperformat,
    bodies: Sequence[str],
    header: str = '',
    footer: str = '',
    landscape: bool = False,
    specific_paperformat_args: Mapping | None = None,
    set_viewport_size: str | None = None,
    scale=72,
) -> bytes:
    """Render a PDF from HTML content using Paper Muncher subprocess.

    :param paperformat: Odoo report paperformat object (may have format, width/height).
    :param Sequence[str] bodies: List of HTML body strings.
    :param str header: HTML header fragment.
    :param str footer: HTML footer fragment.
    :param bool landscape: Whether to use landscape layout.
    :param Optional[Mapping] specific_paperformat_args: Optional override arguments.
    :param Optional[str] set_viewport_size: Optional viewport string (currently unused).
    :return: PDF bytes returned by Paper Muncher.
    :rtype: bytes
    :param scale:
    :raises RuntimeError: If Paper Muncher fails during any phase.
    """
    if not isinstance(bodies, (list, tuple)):
        bodies = list(bodies)

    if len(bodies) > 1:
        documents = make_multi_docs_html(bodies, header, footer)
    else:
        header = partition_on_body(header)[1]
        footer = partition_on_body(footer)[1]
        open_body, body, close_body = partition_on_body(bodies[0])
        documents = [f'{open_body}{header}{body}{footer}{close_body}\n']

    FEATURE_FLAGS = True

    extra_args = ['--scale', f'{scale}dpi']

    if landscape:
        extra_args += ['--orientation', 'landscape']

    if FEATURE_FLAGS:
        extra_args += ['--feature', '*=on']  # activate all experimental/optional features
        # extra_args += ['--debug', 'http-client=on'] # logs paper-munchers requests
        extra_args += ['--margins', 'none']

    if paperformat and paperformat.format:
        if paperformat.format != 'custom':
            extra_args += ['--paper', str(paperformat.format)]
        elif paperformat.page_height and paperformat.page_width:
            extra_args += ['--width', f'{paperformat.page_width}mm']
            extra_args += ['--height', f'{paperformat.page_height}mm']

    return run_process(which_paper_muncher(), extra_args, documents)


def run_process(
    binary,
    extra_args,
    documents,
):
    env = os.environ.copy()
    # Disable ANSI color codes in subprocess logs to prevent parsing errors.
    env['NO_COLOR'] = '1'

    names = [f"pipe:{i}.html" for i in range(len(documents))]

    with subprocess.Popen(
        [binary, *names, '-o', "pipe:"] + extra_args,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    ) as process:
        return _serve_requests(process, documents)


@cache
def which_paper_muncher() -> os.PathLike:
    f""" Look for the paper-muncher binary in PATH or at {FALLBACK_BIN_PATH}. """
    try:
        binary = find_in_path('paper-muncher')
    except OSError as exc:
        if not os.path.isfile(FALLBACK_BIN_PATH):
            e = "paper-muncher binary not found in PATH"
            raise RuntimeError(e) from exc
        binary = FALLBACK_BIN_PATH

    try:
        subprocess.run(
            [binary, '--version'],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        e = f"bad paper-muncher found at {binary}"
        raise RuntimeError(e) from exc

    return binary


try:
    _bin_path = which_paper_muncher()
except RuntimeError:
    _logger.error("Error finding the paper-muncher binary.",
        exc_info=_logger.isEnabledFor(logging.DEBUG))
else:
    _logger.info("Found paper-muncher binary at %s", _bin_path)
    del _bin_path
