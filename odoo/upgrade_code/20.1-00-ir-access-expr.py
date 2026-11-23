"""Rewrite dynamic values of ir.access domains into `*.expr` operators.

The values are moved into strings evaluated by `expr_eval` (see
`_operator_expr_eval` in `odoo/orm/domains.py`), so that the domains can be
parsed with `ast.literal_eval` instead of `safe_eval`.

    [('user_id', '=', user.id)]             => [('user_id', 'in.expr', 'user')]
    [('company_id', 'in', company_ids)]     => [('company_id', 'in.expr', 'companies')]
    [('user_ids', 'in', [user.id, False])]  => [('user_ids', 'in.expr', 'user.ids + [False]')]
    [('user_id', '!=', user.id)]            => ['!', ('user_id', 'in.expr', 'user')]
"""
from __future__ import annotations

import ast
import csv
import io
import logging
import re
import typing

from lxml import etree

if typing.TYPE_CHECKING:
    from odoo.cli.upgrade_code import FileManager

_logger = logging.getLogger(__name__)

# names of the old evaluation context => names in ExprContext
NAMES = {
    'user': 'user',
    'website': 'website',
    'company_ids': 'companies',
    'company_id': 'company',
}
# records that always exist, `.id` is never False
NON_EMPTY_RECORDS = frozenset((
    'user', 'company', 'user.company_id', 'user.partner_id',
    'user.commercial_partner_id', 'user.partner_id.commercial_partner_id',
))
# operator => (new operator, negate)
OPERATORS = {
    '=': ('in.expr', False),
    'in': ('in.expr', False),
    'child_of': ('child_of.expr', False),
    'parent_of': ('parent_of.expr', False),
    '!=': ('in.expr', True),
    'not in': ('in.expr', True),
}
X2MANY_RE = re.compile(r'\w+_ids\.(?!ids$)\w+')


class CannotConvert(Exception):
    pass


def _is_literal(node: ast.AST | str) -> bool:
    try:
        ast.literal_eval(node)
        return True
    except (ValueError, SyntaxError, TypeError):
        return False


def _kind(attr: str) -> str:
    """Guess whether the field is relational from its name."""
    return 'record' if attr.endswith(('_id', '_ids')) else 'scalar'


class DomainConverter:
    def __init__(self):
        self.where = ''

    def convert(self, domain: str, where: str = '') -> str | None:
        """Return the converted domain, None if it is a literal or cannot be converted."""
        self.where = where
        domain = domain.strip()
        if not domain or _is_literal(domain):
            return None
        try:
            return ast.unparse(self._domain(ast.parse(domain, mode='eval').body))
        except SyntaxError as e:
            _logger.warning("%s: cannot parse domain, migrate manually: %s", where, e)
        except CannotConvert as e:
            _logger.warning("%s: cannot convert domain, migrate manually: %s", where, e)
            return None
        return None

    def _domain(self, node) -> ast.List:
        if not isinstance(node, ast.List):
            raise CannotConvert(f"not a list: {ast.unparse(node)}")
        return ast.List([new for item in node.elts for new in self._condition(item)], ast.Load())

    def _condition(self, node) -> list[ast.AST]:
        if _is_literal(node):
            return [node]
        if not (
            isinstance(node, (ast.List, ast.Tuple))
            and len(node.elts) == 3
            and _is_literal(node.elts[0])
            and isinstance(node.elts[1], ast.Constant)
        ):
            raise CannotConvert(f"invalid condition: {ast.unparse(node)}")
        field, operator, value = node.elts
        if operator.value in ('any', 'not any', 'any!', 'not any!'):
            return [ast.Tuple([field, operator, self._domain(value)], ast.Load())]
        new_operator, negate = OPERATORS.get(operator.value, (None, False))
        if new_operator is None:
            raise CannotConvert(f"unsupported operator: {ast.unparse(node)}")
        condition = ast.Tuple([field, ast.Constant(new_operator), ast.Constant(self._value(value))], ast.Load())
        return [ast.Constant('!'), condition] if negate else [condition]

    def _value(self, node) -> str:
        expr, kind = self._expr(node)
        if kind == 'scalar':
            # field of a singleton record, e.g. user.login
            if not expr.startswith(tuple(NON_EMPTY_RECORDS)):
                raise CannotConvert(f"unsupported value: {ast.unparse(node)}")
            expr = f"[{expr}]"  # TODO or support 'expr' 'user.login' in implem
        if X2MANY_RE.search(expr):
            _logger.warning("%s: traversal of x2many %s, consider a searchable computed field", self.where, expr)
        return expr

    def _expr(self, node) -> tuple[str, typing.Literal['record', 'list', 'scalar']]:
        """Return the expression and its kind: 'record', 'list' or 'scalar'."""
        match node:
            case ast.Constant(value=value):
                return repr(value), 'scalar'
            case ast.Name(id=name) if name in NAMES:
                return NAMES[name], 'record'
            case ast.Attribute(value=ast.Attribute(value=ast.Name(id='user'), attr='env'), attr='companies' | 'company' | 'website'):
                return node.attr, 'record'
            case ast.Attribute(value=value, attr=attr):
                base, kind = self._expr(value)
                if kind != 'record':
                    raise CannotConvert(f"unsupported attribute: {ast.unparse(node)}")
                if attr == 'id':
                    if base not in NON_EMPTY_RECORDS:
                        _logger.warning("%s: %s may be False, the new domain does not match empty values", self.where, ast.unparse(node))
                    return base, 'record'
                if attr == 'ids':
                    return f"{base}.ids", 'list'
                return f"{base}.{attr}", _kind(attr)
            case ast.Call(func=ast.Attribute(value=value, attr='mapped'), args=[ast.Constant(value=str() as path)], keywords=[]):
                base, kind = self._expr(value)
                # expr_eval cannot map non-relational fields on multiple records
                if kind != 'record' or _kind(path.rpartition('.')[2]) != 'record':
                    raise CannotConvert(f"unsupported mapped: {ast.unparse(node)}")
                return f"{base}.{path}", 'record'
            case ast.List(elts=elts) | ast.Tuple(elts=elts):
                elts = [elt.value if isinstance(elt, ast.Starred) else elt for elt in elts]
                parts = [self._list(elt) for elt in elts if not isinstance(elt, ast.Constant)]
                if constants := [elt.value for elt in elts if isinstance(elt, ast.Constant)]:
                    parts.append(repr(constants))
                return ' + '.join(parts) or '[]', 'list'
            case ast.BinOp(op=ast.Add(), left=left, right=right):
                return f"{self._list(left)} + {self._list(right)}", 'list'
        raise CannotConvert(f"unsupported expression: {ast.unparse(node)}")

    def _list(self, node) -> str:
        expr, kind = self._expr(node)
        if kind == 'record':
            return f"{expr}.ids"
        if kind == 'scalar':
            return f"[{expr}]"
        return expr


def upgrade_csv(file, converter: DomainConverter):
    content = file.content
    reader = csv.reader(io.StringIO(content, newline=''))
    header = next(reader, [])
    if 'domain' not in header:
        return
    index = header.index('domain')
    domains = {}  # {domain: xml id}
    for row in reader:
        if len(row) > index:
            domains.setdefault(row[index], row[0])
    for domain, xmlid in domains.items():
        if new_domain := converter.convert(domain, f"{file.path}:{xmlid}"):
            old_cell = '"' + domain.replace('"', '""') + '"'
            if old_cell not in content:
                _logger.warning("%s:%s: domain not found in file", file.path, xmlid)
                return
            content = content.replace(old_cell, '"' + new_domain.replace('"', '""') + '"')
    file.content = content


def upgrade_xml(file, converter: DomainConverter):
    content = file.content
    if 'ir.access' not in content:
        return
    try:
        tree = etree.parse(io.BytesIO(content.encode()))
    except etree.XMLSyntaxError as e:
        _logger.info("Failed to parse the file %s: %s", file.path, e)
        return
    for field in tree.iterfind(".//record[@model='ir.access']/field[@name='domain']"):
        xmlid = field.getparent().get('id')
        if len(field) or not (new_domain := converter.convert(field.text or '', f"{file.path}:{xmlid}")):
            continue
        escaped = field.text.replace('&', '&amp;').replace('<', '&lt;')
        old_text = next((text for text in (escaped.replace('>', '&gt;'), escaped) if text in content), None)
        if old_text is None:
            _logger.warning("%s:%s: domain not found in file", file.path, xmlid)
            return
        content = content.replace(old_text, new_domain.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))
    file.content = content


def upgrade(file_manager: FileManager):
    converter = DomainConverter()
    for file in file_manager:
        if file.path.name == 'ir.access.csv':
            upgrade_csv(file, converter)
        elif file.path.suffix == '.xml' and file.path.parent.name in ('data', 'security'):
            upgrade_xml(file, converter)


def test(domain, result):
    output = DomainConverter().convert(domain)
    assert output == result, f"Failed to convert {domain!r}; got {output!r} instead of {result!r}"


if __name__ == '__main__':
    logging.basicConfig(level=logging.DEBUG)
    test("[('x', '=', 1)]", None)
    test("[('user_id', '=', user.id)]", "[('user_id', 'in.expr', 'user')]")
    test("[('company_id', 'in', company_ids)]", "[('company_id', 'in.expr', 'companies')]")
    test("['|', ('company_id', '=', False), ('company_id', 'parent_of', company_ids)]",
         "['|', ('company_id', '=', False), ('company_id', 'parent_of.expr', 'companies')]")
    test("[('user_ids', 'in', [user.id, False])]", "[('user_ids', 'in.expr', 'user.ids + [False]')]")
    test("[('company_id', 'in', [False, *company_ids])]", "[('company_id', 'in.expr', 'companies.ids + [False]')]")
    test("[('user_id', '!=', user.id)]", "['!', ('user_id', 'in.expr', 'user')]")
    test("[('partner_id', 'child_of', user.partner_id.commercial_partner_id.id)]",
         "[('partner_id', 'child_of.expr', 'user.partner_id.commercial_partner_id')]")
    test("[('country_id', 'in', user.env.companies.mapped('country_id').ids + [False])]",
         "[('country_id', 'in.expr', 'companies.country_id.ids + [False]')]")
    test("[('company_id', 'in', [False, website.company_id.id])]",
         "[('company_id', 'in.expr', 'website.company_id.ids + [False]')]")
    test("[('group_ids', 'in', user.all_group_ids.ids)]", "[('group_ids', 'in.expr', 'user.all_group_ids.ids')]")
    test("[('a', 'any', [('partner_id', '=', user.partner_id.id), ('x', '=', 1)])]",
         "[('a', 'any', [('partner_id', 'in.expr', 'user.partner_id'), ('x', '=', 1)])]")
    test("[('login', '=', user.login)]", "[('login', 'in.expr', '[user.login]')]")
    test("""[
        '|', ('user_id', '=', user.id),  # comment
        ('x', '=', 'é')]""", "['|', ('user_id', 'in.expr', 'user'), ('x', '=', 'é')]")
    test("[('x', '=', user.env.ref('base.main_company').id)]", None)
    test("[('x', '>', user.id)]", None)
    test("[('x', 'in', user.env.companies.mapped('country_code') + [False])]", None)
    test("[('x', '=', user.employee_id.name)]", None)
    test("[('x', '=', time.strftime('%Y'))]", None)
    _logger.info("All tests passed")
