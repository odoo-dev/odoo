import os
import re

import astroid
import pylint.interfaces
from pylint.checkers import BaseChecker

try:
    from pylint.checkers.utils import only_required_for_messages
except ImportError:
    from pylint.checkers.utils import check_messages as only_required_for_messages

# https://docs.python.org/2.6/library/stdtypes.html#string-formatting-operations
PLACEHOLDER_REGEXP = re.compile(r"""
    (?<!%)             # avoid matching escaped %
    %
    [#0\- +]*          # conversion flag
    (?:\d+|\*)?        # minimum field width
    (?:\.(?:\d+|\*))?  # precision
    [hlL]?             # length modifier
    [bcdeEfFgGnorsxX]  # conversion type
""", re.VERBOSE)
REPR_REGEXP = re.compile(r"%(?:\(\w+\))?r")


def parse_version(s):
    # can't use odoo.tools.parse_version because pythonpath is screwed from
    # inside pylint on runbot
    return [s.rjust(3, '0') for s in s.split('.')]


class OdooBaseChecker(BaseChecker):
    if parse_version(pylint.__version__) < parse_version('2.14.0'):
        __implements__ = pylint.interfaces.IAstroidChecker
    name = 'odoo'

    msgs = {
        "E8502": (
            "Bad usage of _, _lt function.",
            "gettext-variable",
            "See https://www.odoo.com/documentation/master/developer/misc/i18n/translations.html#variables",
        ),
        "E8505": (
            "Usage of _, _lt function with multiple unnamed placeholders",
            "gettext-placeholders",
            "Use keyword arguments when you have multiple placeholders",
        ),
        "E8506": (
            "Usage of %r in _, _lt function",
            "gettext-repr",
            "Don't use %r to automatically insert quotes in translation strings. Quotes can be different depending on the language: they must be part of the translated string.",
        ),
        "E8507": (
            "Static string passed to %s without gettext call.",
            "missing-gettext",
            "Ensure that all static strings passed to certain constructs are wrapped in a gettext call.",
        ),
    }

    required_inside_functions = ['UserError', 'ValidationError', 'AccessError', 'AccessDenied', 'MissingError']

    @only_required_for_messages('missing-gettext', 'gettext-variable', 'gettext-placeholders', 'gettext-repr')
    def visit_call(self, node):
        file_path = self.linter.current_file
        if (
            "test" in file_path
            and (module_path := find_module_root(file_path))
            and (
                # Check if the module's base name starts with "test_"
                # This identifies modules dedicated to testing (e.g., test_mail)
                os.path.basename(os.path.normpath(module_path)).startswith("test_")
                # OR check if the file is in a "tests" subdirectory within the module
                # This identifies test files located within the standard "tests" directory/package
                or file_path[len(module_path) + 1 :].startswith("tests" + os.sep)
            )
        ):
            return

        if (
            isinstance(node.func, astroid.Name)
            and node.func.name in self.required_inside_functions
            and len(node.args) > 0
        ):
            first_arg = node.args[0]
            if (
                isinstance(first_arg, astroid.Const)
                and isinstance(first_arg.value, str)
                and not (isinstance(first_arg.parent, astroid.Call) and first_arg.parent.func.name in ("_", "_lt"))
            ):
                self.add_message("missing-gettext", node=node, args=(node.func.name,))
                return

        if not isinstance(node.func, astroid.Name) or node.func.name not in ("_", "_lt"):
            return
        first_arg = node.args[0]
        if not (isinstance(first_arg, astroid.Const) and isinstance(first_arg.value, str)):
            self.add_message("gettext-variable", node=node)
            return
        if len(PLACEHOLDER_REGEXP.findall(first_arg.value)) >= 2:
            self.add_message("gettext-placeholders", node=node)
        if re.search(REPR_REGEXP, first_arg.value):
            self.add_message("gettext-repr", node=node)


def register(linter):
    linter.register_checker(OdooBaseChecker(linter))

def find_module_root(file_path):
    """Manually determine the module root by searching for manifest files."""
    current_dir = os.path.dirname(file_path)

    while current_dir and current_dir != os.path.dirname(current_dir):
        if os.path.isfile(os.path.join(current_dir, "__manifest__.py")) or os.path.isfile(os.path.join(current_dir, "__openerp__.py")):
            return current_dir
        current_dir = os.path.dirname(current_dir)

    return None
