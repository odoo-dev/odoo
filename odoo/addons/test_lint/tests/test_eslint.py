# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import re
import subprocess
from itertools import chain
from unittest import skipIf

from odoo import tools
from odoo.modules import get_modules
from odoo.tests import tagged
from odoo.tools.misc import file_path

from . import lint_case

_logger = logging.getLogger(__name__)

try:
    eslint = tools.misc.find_in_path('eslint')
except OSError:
    eslint = None


@skipIf(eslint is None, "eslint tool not found on this system")
@tagged("test_themes")
@tagged('at_install', '-post_install')  # LEGACY at_install
class TestESLint(lint_case.LintCase):

    longMessage = True

    def _parse_ignorefile(self, ignore_path):
        """ Parse eslintignore patterns from file """

        ignore_patterns = []
        with tools.file_open(ignore_path) as f:
            for line in f.readlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("!"):
                    line = line.replace("!", "!*/")
                else:
                    line = '*/' + line
                ignore_patterns.append(line)
        return ignore_patterns

    def _test_eslint(self, config_path, ignore_path, modules=None, no_ignore=False, fix_all=False):
        """ Test that there are no eslint errors in javascript files """

        if not modules:
            modules = get_modules()
        files_to_check = list(self.iter_module_files('**/static/**/*.js', modules=modules))
        _logger.info('Testing %s js files', len(files_to_check))
        eslint_args = ["--no-eslintrc", "--config", config_path]
        eslint_args += ["--fix"] if fix_all else []
        eslint_args += ["--no-ignore"] if no_ignore else list(chain.from_iterable([["--ignore-pattern", pattern] for pattern in self._parse_ignorefile(ignore_path)]))
        cmd = [eslint] + eslint_args + files_to_check
        _logger.debug('ESLint command: %s', cmd)
        process = subprocess.run(cmd, capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(process.returncode, 0, msg=f"""
stdout: {process.stdout}
Perhaps you might benefit from installing the tooling found at:
https://github.com/odoo/odoo/wiki/Javascript-coding-guidelines#use-a-linter \n
stderr: {process.stderr}
""")

    def test_eslint(self):
        self._test_eslint(file_path('web/tooling/_eslintrc.json'), file_path("web/tooling/_eslintignore"))
