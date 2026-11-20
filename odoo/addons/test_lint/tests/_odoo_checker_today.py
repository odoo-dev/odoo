import functools
import os
import re

import pylint.interfaces
from astroid import nodes
from pylint import checkers

# modules whose dates are business or legal ones: the date of an invoice, a
# payment, an order, a delivery, ... must be the date of the user or company
SCOPE = re.compile(r'(account|l10n|point_of_sale|pos|purchase|sale|stock)(_.*)?$')
DATE_CLASSES = {'date', 'Date', 'fields.Date', 'datetime.date'}
DATETIME_CLASSES = {'datetime', 'Datetime', 'fields.Datetime', 'datetime.datetime'}


def parse_version(s):
    # can't use odoo.tools.parse_version because pythonpath is screwed from
    # inside pylint on runbot
    return [s.rjust(3, '0') for s in s.split('.')]


@functools.cache
def module_of(dirname):
    """ Return the name of the addon containing the directory, or ``None``. """
    while True:
        if os.path.isfile(os.path.join(dirname, '__manifest__.py')):
            return os.path.basename(dirname)
        parent = os.path.dirname(dirname)
        if parent == dirname:
            return None
        dirname = parent


class OdooBaseChecker(checkers.BaseChecker):
    if parse_version(pylint.__version__) < parse_version('2.14.0'):
        __implements__ = pylint.interfaces.IAstroidChecker
    name = 'odoo'

    msgs = {
        'E8508': (
            'UTC date used as the current date, use the date of the user or of the company',
            'utc-today',
            (
                'The server runs in UTC: date.today(), fields.Date.today() and '
                'datetime.now().date() return the UTC date, which differs from the '
                "date of the user and of the company for a part of the day. Use "
                "fields.Date.context_today(record) for the user's date, or "
                "company._get_company_today() for the company's one."
            ),
        ),
        'E8509': (
            'Argument of fields.Datetime.now() or fields.Date.today() ignored',
            'ignored-now-argument',
            (
                'fields.Datetime.now() and fields.Date.today() ignore their arguments, '
                'which only exist to use them as field defaults: '
                'fields.Datetime.now(ZoneInfo(tz)) returns the naive UTC datetime. '
                'Use datetime.now(ZoneInfo(tz)), or fields.Datetime.context_timestamp().'
            ),
        ),
    }

    def _in_scope(self, node):
        path = node.root().file
        if not path or f'{os.sep}tests{os.sep}' in path:
            return False
        module = module_of(os.path.dirname(os.path.abspath(path)))
        return bool(module and SCOPE.match(module))

    def visit_call(self, node):
        func = node.func
        if not isinstance(func, nodes.Attribute):
            return
        if (
            (node.args or node.keywords)
            and (func.attrname, func.expr.as_string()) in {
                ('now', 'fields.Datetime'), ('now', 'Datetime'),
                ('today', 'fields.Date'), ('today', 'Date'),
            }
        ):
            self.add_message('ignored-now-argument', node=node)
        if (
            # date.today(), datetime.today()
            func.attrname == 'today' and func.expr.as_string() in DATE_CLASSES | DATETIME_CLASSES
        ) or (
            # datetime.now().date()
            func.attrname == 'date' and not node.args
            and isinstance(func.expr, nodes.Call)
            and isinstance(func.expr.func, nodes.Attribute)
            and func.expr.func.attrname in ('now', 'utcnow', 'today')
            and func.expr.func.expr.as_string() in DATETIME_CLASSES
        ) or (
            # time.strftime('%Y-%m-%d')
            func.attrname == 'strftime' and func.expr.as_string() == 'time' and len(node.args) == 1
        ):
            if self._in_scope(node):
                self.add_message('utc-today', node=node)

    def visit_attribute(self, node):
        # default=fields.Date.today
        if (
            node.attrname == 'today'
            and node.expr.as_string() in DATE_CLASSES
            and not (isinstance(node.parent, nodes.Call) and node.parent.func is node)
            and self._in_scope(node)
        ):
            self.add_message('utc-today', node=node)


def register(linter):
    linter.register_checker(OdooBaseChecker(linter))
