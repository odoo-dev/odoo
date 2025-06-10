# Part of Odoo. See LICENSE file for full copyright and licensing details.

import functools
import logging
import re
import subprocess
import typing

from itertools import islice
from lxml import etree

from odoo.tools import config, parse_version, split_every
from odoo.tools.misc import find_in_path

_logger = logging.getLogger(__name__)


def _run_wkhtmltopdf(args):
    """
    Runs the given arguments against the wkhtmltopdf binary.

    Returns:
        The process
    """
    bin_path = _wkhtml().bin
    return subprocess.run(
        [bin_path, *args],
        capture_output=True,
        encoding='utf-8',
        check=False,
    )


def _split_table(tree, max_rows):
    """
    Walks through the etree and splits tables with more than max_rows rows into
    multiple tables with max_rows rows.

    This function is needed because wkhtmltopdf has a exponential processing
    time growth when processing tables with many rows. This function is a
    workaround for this problem.

    :param tree: The etree to process
    :param max_rows: The maximum number of rows per table
    """
    for table in list(tree.iter('table')):
        prev = table
        for rows in islice(split_every(max_rows, table), 1, None):
            sibling = etree.Element('table', attrib=table.attrib)
            sibling.extend(rows)
            prev.addnext(sibling)
            prev = sibling


class WkhtmlInfo(typing.NamedTuple):
    state: typing.Literal['install', 'ok']
    dpi_zoom_ratio: bool
    bin: str
    version: str
    wkhtmltoimage_bin: str
    wkhtmltoimage_version: tuple[str, ...] | None


@functools.lru_cache(1)
def _wkhtml() -> WkhtmlInfo:
    state = 'install'
    bin_path = 'wkhtmltopdf'
    version = ''
    dpi_zoom_ratio = False
    try:
        bin_path = find_in_path('wkhtmltopdf')
        process = subprocess.Popen(
            [bin_path, '--version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
    except OSError:
        _logger.info('You need Wkhtmltopdf to print a pdf version of the reports.')
    else:
        _logger.info('Will use the Wkhtmltopdf binary at %s', bin_path)
        out, _err = process.communicate()
        version = out.decode('ascii')
        match = re.search(r'([0-9.]+)', version)
        if match:
            version = match.group(0)
            if parse_version(version) < parse_version('0.12.0'):
                _logger.info('Upgrade Wkhtmltopdf to (at least) 0.12.0')
                state = 'upgrade'
            else:
                state = 'ok'
            if parse_version(version) >= parse_version('0.12.2'):
                dpi_zoom_ratio = True

            if config['workers'] == 1:
                _logger.info('You need to start Odoo with at least two workers to print a pdf version of the reports.')
                state = 'workers'
        else:
            _logger.info('Wkhtmltopdf seems to be broken.')
            state = 'broken'

    wkhtmltoimage_version = None
    image_bin_path = 'wkhtmltoimage'
    try:
        image_bin_path = find_in_path('wkhtmltoimage')
        process = subprocess.Popen(
            [image_bin_path, '--version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
    except OSError:
        _logger.info('You need Wkhtmltoimage to generate images from html.')
    else:
        _logger.info('Will use the Wkhtmltoimage binary at %s', image_bin_path)
        out, _err = process.communicate()
        match = re.search(rb'([0-9.]+)', out)
        if match:
            wkhtmltoimage_version = parse_version(match.group(0).decode('ascii'))
            if config['workers'] == 1:
                _logger.info('You need to start Odoo with at least two workers to convert images to html.')
        else:
            _logger.info('Wkhtmltoimage seems to be broken.')

    return WkhtmlInfo(
        state=state,
        dpi_zoom_ratio=dpi_zoom_ratio,
        bin=bin_path,
        version=version,
        wkhtmltoimage_bin=image_bin_path,
        wkhtmltoimage_version=wkhtmltoimage_version,
    )


def _run_wkhtmltopdf(args):
    """
    Runs the given arguments against the wkhtmltopdf binary.

    Returns:
        The process
    """
    bin_path = _wkhtml().bin
    return subprocess.run(
        [bin_path, *args],
        capture_output=True,
        encoding='utf-8',
        check=False,
    )


def _split_table(tree, max_rows):
    """
    Walks through the etree and splits tables with more than max_rows rows into
    multiple tables with max_rows rows.

    This function is needed because wkhtmltopdf has a exponential processing
    time growth when processing tables with many rows. This function is a
    workaround for this problem.

    :param tree: The etree to process
    :param max_rows: The maximum number of rows per table
    """
    for table in list(tree.iter('table')):
        prev = table
        for rows in islice(split_every(max_rows, table), 1, None):
            sibling = etree.Element('table', attrib=table.attrib)
            sibling.extend(rows)
            prev.addnext(sibling)
            prev = sibling
