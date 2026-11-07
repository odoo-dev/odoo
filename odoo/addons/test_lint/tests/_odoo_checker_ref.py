import os

import astroid
import pylint.interfaces
from pylint import checkers


def parse_version(s):
    # can't use odoo.tools.parse_version because pythonpath is screwed from
    # inside pylint on runbot
    return [s.rjust(3, '0') for s in s.split('.')]


def is_optional_ref(node):
    """ Return whether ``node`` is a call like ``env.ref(xmlid, raise_if_not_found=False)``,
    which returns ``None`` when the record is missing. """
    if not (
        isinstance(node, astroid.Call)
        and isinstance(node.func, astroid.Attribute)
        and node.func.attrname == 'ref'
    ):
        return False
    for keyword in node.keywords or ():
        if keyword.arg == 'raise_if_not_found':
            return isinstance(keyword.value, astroid.Const) and keyword.value.value is False
    return (
        len(node.args) >= 2
        and isinstance(node.args[1], astroid.Const)
        and node.args[1].value is False
    )


def is_test_file(node):
    path = node.root().file or ''
    parts = path.split(os.sep)
    return 'tests' in parts or any(part.startswith('test_') for part in parts[:-1])


class OdooBaseChecker(checkers.BaseChecker):
    if parse_version(pylint.__version__) < parse_version('2.14.0'):
        __implements__ = pylint.interfaces.IAstroidChecker
    name = 'odoo'

    msgs = {
        'E8508': (
            'Attribute read on an optional env.ref()',
            'ref-optional-dereference',
            'env.ref(..., raise_if_not_found=False) returns None when the '
            'record is missing, so reading an attribute directly on its '
            'result crashes. Check the result first, drop '
            'raise_if_not_found=False if the record is required, or declare '
            'models.Ref(..., required=False), which returns an empty recordset.'
        ),
    }

    def visit_attribute(self, node):
        if is_optional_ref(node.expr) and not is_test_file(node):
            self.add_message('ref-optional-dereference', node=node)


def register(linter):
    linter.register_checker(OdooBaseChecker(linter))
