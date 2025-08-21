# Part of Odoo. See LICENSE file for full copyright and licensing details.

"""The :mod:`odoo.addons.base_report_paper_muncher.engine.utils.binary` module
provides utilities to locate and validate the Paper Muncher binary.
"""


import logging
import subprocess
from typing import Optional

from odoo.http import request, root
from odoo.tools.misc import find_in_path

_logger = logging.getLogger(__name__)

FALLBACK_BINARY = '/opt/paper-muncher/bin/paper-muncher'


def get_paper_muncher_binary() -> Optional[str]:
    """Find and validate the Paper Muncher binary

    :return: Path to the Paper Muncher binary if found and usable,
        None otherwise.
    :rtype: str or None
    """
    try:
        binary = find_in_path('paper-muncher')
    except OSError:
        _logger.debug("Cannot locate in path paper-muncher", exc_info=True)
        binary = FALLBACK_BINARY

    try:
        subprocess.run(
            [binary, '--version'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
    except subprocess.CalledProcessError:
        _logger.debug("Cannot use paper-muncher", exc_info=True)
        return None

    return binary


def can_use_paper_muncher() -> bool:
    """Check if Paper Muncher binary is available and usable.

    :return: True if Paper Muncher is in debug session and available,
        False otherwise.
    :rtype: bool
    """
    return bool(get_paper_muncher_binary())
