# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
from pathlib import Path

from odoo.modules import get_modules, get_module_path
from . import lint_case
import re
_logger = logging.getLogger(__name__)

import_odoo_re = re.compile(r'import odoo\s*$')
import_orm_re = re.compile(r'^(from|import)\s+odoo\.orm')


class TestLintImport(lint_case.LintCase):

    def test_lint_import(self):
        """ Test that odoo.orm is not imported in Odoo modules"""

        violations = []
        for module in get_modules():
            module_path = Path(get_module_path(module))
            for path in module_path.rglob("**/*.py"):
                for line in path.read_text().splitlines():
                    if import_odoo_re.match(line):
                        violations.append(f"{path}: explain `import odoo` with a comment or import the right sub-module")
                    if import_orm_re.match(line):
                        violations.append(f"{path}: do not import directly from `odoo.orm`, use odoo.(api,fields,models)")
        if violations:
            violations = sorted(violations)
            violations.insert(0, "Invalid import found:")
            self.fail('\n'.join(violations))
