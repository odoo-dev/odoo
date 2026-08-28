# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
import subprocess
from os.path import join

from odoo import tools
from odoo.modules import Manifest
from odoo.release import MIN_PY_VERSION
from odoo.tools.which import which

from .common import LintCase

_logger = logging.getLogger(__name__)

SELECT_RULES = [
    # 'E722',  # bare-except TODO enable
    # 'EXE',  # executables TODO enable
    'S307',
    'F811',
]

IGNORE_RULES = [
    'E501',  # line too long is too subjective
]


class TestRuffLint(LintCase):
    def _skip_test(self, reason):
        _logger.warning(reason)
        self.skipTest(reason)

    def test_ruff(self):
        try:
            ruff_bin = which('ruff')
            r = subprocess.run(
                [ruff_bin, '--version'],
                capture_output=True,
                check=True,
                text=True,
            )
            _logger.info('%s', r.stdout)
        except OSError:
            self._skip_test('ruff not found or not executable')

        paths = {tools.config.root_path}
        for manifest in Manifest.all_addon_manifests():
            module_path = manifest.path
            if module_path.startswith(join(tools.config.root_path, 'addons')):
                continue
            paths.add(module_path)

        options = [
            '--isolated',  # ignore all configuration files
            '--target-version',
            f'py{MIN_PY_VERSION[0]}{MIN_PY_VERSION[1]}',
            '--select',
            ','.join(SELECT_RULES),
            '--ignore',
            ','.join(IGNORE_RULES),
        ]

        r = subprocess.run(
            [ruff_bin, 'check', *options, *sorted(paths)],
            capture_output=True,
            text=True,
        )
        if r.returncode:
            self.fail(f"ruff test failed:\n\n{r.stdout}\n{r.stderr}".strip())
        else:
            _logger.debug("%s", r.stdout)
