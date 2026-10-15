# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import os
import re
import subprocess
from unittest import skipIf
from odoo import tools
from odoo.tests import tagged
from odoo.tools.misc import file_path
from odoo.modules import get_modules

from .common import LintCase

_logger = logging.getLogger(__name__)

try:
    eslint = tools.misc.find_in_path('eslint')
except IOError:
    eslint = None


@skipIf(eslint is None, "eslint tool not found on this system")
@tagged("test_themes")
class TestESLint(LintCase):

    longMessage = True

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        version = subprocess.run([eslint, '--version'], capture_output=True, encoding="utf-8", check=False).stdout
        # ESLint 8 only reads the eslintrc configs, kept until the CI runs ESLint 10
        cls.legacy_eslint = int(re.search(r'\d+', version).group()) < 9

    def _test_eslint(self, modules, config_path, extension='js', exclude=None):
        """ Test that there are no eslint errors in the javascript or css files """

        files_to_check = [
            p for p in self.iter_module_files(f'**/static/**/*.{extension}', modules=modules)
            if not re.match('.*/libs?/.*', p)  # don't check libraries
            if not re.match(f'.*/o_spreadsheet/o_spreadsheet.{extension}', p) # don't check generated code
            if not (exclude and re.match(exclude, p))
        ]
        _logger.info('Testing %s %s files', len(files_to_check), extension)
        if self.legacy_eslint:
            cmd = [eslint, '--no-eslintrc', '--resolve-plugins-relative-to', os.getcwd()]
            env = {**os.environ, 'ESLINT_USE_FLAT_CONFIG': 'false'}
        else:
            cmd, env = [eslint], None
        cmd += ['--no-ignore', '-c', config_path] + files_to_check
        # eslint skips files outside of the working directory, the addons may be anywhere
        process = subprocess.run(cmd, capture_output=True, encoding="utf-8", check=False, cwd='/', env=env)
        self.assertEqual(process.returncode, 0, msg=f"""
stdout: {process.stdout}
Perhaps you might benefit from installing the tooling found at:
https://github.com/odoo/odoo/wiki/Javascript-coding-guidelines#use-a-linter \n
stderr: {process.stderr}
""")

    def test_eslint(self):
        basic_test, strict_test = [], []
        for module in get_modules():
            strict_test.append(module) if re.search(r'^point_of_sale$|^pos_.*$|^.*_pos$|^.*_pos_.*$|^iot$|^iot_.*$|^obox$|^obox_.*$', module) else basic_test.append(module)
        if self.legacy_eslint:
            self._test_eslint(basic_test, file_path('test_lint/tests/eslintrc'))
            self._test_eslint(strict_test, file_path('test_lint/tests/eslintrc_strict'))
        else:
            self._test_eslint(basic_test, file_path('test_lint/tests/eslint_basic.config.cjs'))
            self._test_eslint(strict_test, file_path('web/tooling/_eslint.config.cjs'))

    def test_eslint_css(self):
        if self.legacy_eslint:
            self.skipTest("linting css needs ESLint 9 or later")
        self._test_eslint(
            get_modules(),
            file_path('web/tooling/_eslint.config.cjs'),
            extension='css',
            exclude='.*/static/invalid_src/.*',  # invalid on purpose
        )
