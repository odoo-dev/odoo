import os
import astroid
from pylint import checkers, interfaces
from pylint.checkers import BaseChecker, utils
from collections import deque


DFTL_CURSOR_EXPR = [
    'self.env.cr', 'self._cr',  # new api
    'self.cr',  # controllers and test
    'cr',  # old api
]
# <attribute> or <name>.<attribute> or <call>.<attribute>
ATTRIBUTE_WHITELIST = [
    '_table', 'name', 'lang', 'id', 'get_lang.code'
]

FUNCTION_WHITELIST = [
    'create', 'read', 'write', 'browse', 'select', 'get', 'strip', 'items', '_select', '_from', '_where',
    'any', 'join', 'split', 'tuple', 'get_sql', 'search', 'list', 'set', 'next', '_get_query', '_where_calc'
]

func_call = {}
func_called_for_query = []

class OdooBaseChecker(BaseChecker):
    __implements__ = interfaces.IAstroidChecker
    name = 'odoo'

    msgs = {
        'E8501': (
            'Possible SQL injection risk.',
            'sql-injection',
            'See http://www.bobby-tables.com try using '
            'execute(query, tuple(params))',
        )
    }

    def _get_return_node(self, node):
        ret = []
        nodes = deque([node])
        while nodes:
            node = nodes.popleft()
            if isinstance(node, astroid.Return):
                ret.append(node)
            else:
                nodes.extend(node.get_children())
        return ret

    def _is_asserted(self, node): # If there is an assert on the value of the node, it's very likely to be safe
        asserted = deque((assert_.test for assert_ in node.scope().nodes_of_class(astroid.Assert)))
        while asserted:
            n = asserted.popleft()
            if isinstance(n, astroid.Name) and n.name == node.name:
                return True
            else:
                asserted.extend(n.get_children())
        return False

    def _get_attribute_chain(self, node):
        if isinstance(node, astroid.Attribute):
            return self._get_attribute_chain(node.expr) + '.' + node.attrname
        elif isinstance(node, astroid.Name):
            return node.name
        elif isinstance(node, astroid.Call):
            return node.func.name
        return '' #FIXME

    def _evaluate_function_call(self, node, args_allowed, position):
        name = node.func.attrname if isinstance(node.func, astroid.Attribute) else node.func.name
        if name == node.scope().name:
            return True
        if  name not in func_called_for_query:
            func_called_for_query.append((name, position))
            cst_args = True
            for arg in node.args:
                if not self._is_constexpr(arg, args_allowed):
                    cst_args = False
        if  name in func_call.keys():
            for fun in func_call[name]:
                func_call[name].pop(func_call[name].index(fun))
                for returnNode in self._get_return_node(fun):
                    if not self._is_constexpr(returnNode.value, cst_args, position=position):
                        func_call.pop(name)
                        return False
            return True
        return True

    def _is_fstring_cst(self, node, args_allowed=False, position=None):
        formatted_string = []
        for format_node in node.values:
            if isinstance(format_node, astroid.FormattedValue):
                if isinstance(format_node.value, astroid.Attribute) and format_node.value.attrname.startswith('_'):
                    formatted_string.append('table_name')
                    continue
                operand = self._is_constexpr(format_node.value, args_allowed=args_allowed, position=position)
                if not operand:
                    return False
                else:
                    formatted_string += [operand]
            elif isinstance(format_node, astroid.Const):
                formatted_string += format_node.value
        return True

    def _is_constexpr(self, node, args_allowed=False, position=None):
        if isinstance(node, astroid.Const): # astroid.const is always safe
            return True
        elif isinstance(node, astroid.List):
            for l in node.elts:
                value = self._is_constexpr(l, args_allowed=args_allowed)
                if not value:
                    return False
            return True
        elif isinstance(node, astroid.Tuple):
            if position is None:
                for child in node.get_children():
                    if not self._is_constexpr(child, args_allowed=args_allowed):
                        return False
                return True
            else:
                return self._is_constexpr(node.elts[position], args_allowed=args_allowed)
        elif isinstance(node, astroid.Set):
            for elem in node.elts:
                if not self._is_constexpr(elem, args_allowed=args_allowed):
                    return False
            return True
        elif isinstance(node, astroid.BinOp): # recusively infer both side of the operation. Failing if either side is not inferable
            if (isinstance(node.left, astroid.Const) and node.left.value == '') or (isinstance(node.right, astroid.Const) and node.right.value == ''):
                return False
            elif isinstance(node.right, astroid.Dict): #case only for %(var)s
                dic = {}
                for value in node.right.items:
                    key = self._is_constexpr(value[0], args_allowed=args_allowed)
                    value = self._is_constexpr(value[1], args_allowed=args_allowed)
                    if not key or not value:
                        return False
                    else:
                        dic[key] = value
                left = self._is_constexpr(node.left, args_allowed=args_allowed)
                if not left:
                    return False
                else:
                    return True
            else:
                left_operand = self._is_constexpr(node.left, args_allowed=args_allowed)
                right_operand = self._is_constexpr(node.right, args_allowed=args_allowed)
                if not left_operand or not right_operand:
                    return False
                else:
                    return  True
        elif isinstance(node, astroid.Name) or isinstance(node, astroid.AssignName): # Variable: find the assignement instruction in the AST and infer its value.
            assignements = node.lookup(node.name)
            assigned_node = []
            for n in assignements[1]: #assignement[0] contains the scope, so assignment[1] contains the assignement nodes
                if isinstance(n.parent, astroid.FunctionDef):
                    assigned_node += [args_allowed]
                elif isinstance(n.parent, astroid.Arguments):
                    assigned_node += [args_allowed]
                elif isinstance(n.parent, astroid.Tuple): # multi assign a,b = (a,b)
                    if isinstance(n.statement(), astroid.For):
                        assigned_node += [self._is_constexpr(n.statement().iter, args_allowed=args_allowed)]
                    else:
                        assigned_node += [self._is_constexpr(n.statement().value, args_allowed=args_allowed, position=n.parent.elts.index(n))]
                elif isinstance(n.parent, astroid.For):
                    assigned_node += [False] #TODO
                elif isinstance(n.parent, astroid.AugAssign):
                    left = self._is_constexpr(n.parent.target, args_allowed=args_allowed)
                    right = self._is_constexpr(n.parent.value, args_allowed=args_allowed)
                    if not left or not right:
                        assigned_node += [False]
                    else:
                        assigned_node += [True]
                elif isinstance(n.parent, astroid.Module):
                    return True
                else:
                    assigned_node += [self._is_constexpr(n.parent.value, args_allowed=args_allowed)]
            if False in assigned_node or len(assigned_node) == 0:
                if not self._is_asserted(node):
                    pass
                return False or self._is_asserted(node)
            else:
                return True
        elif isinstance(node, astroid.JoinedStr):
            return self._is_fstring_cst(node, args_allowed)
        elif isinstance(node, astroid.Call) and isinstance(node.func, astroid.Attribute):
            if node.func.attrname == 'append':
                return self._is_constexpr(node.args[0])
            elif node.func.attrname == 'format':
                key_value_arg = []
                if not node.keywords: # no args in format
                    return self._is_constexpr(node.func.expr, args_allowed=args_allowed)
                else:
                    for key in node.keywords:
                        inferred_value = self._is_constexpr(key.value, args_allowed=args_allowed)
                        if not inferred_value:
                            return False
                        else:
                            key_value_arg += [True]
                return True
            elif node.func.attrname == 'substitute':
                return False #Never used in code
            else:
                return self._evaluate_function_call(node, args_allowed=args_allowed, position=position)
        elif isinstance(node, astroid.Call):
            return self._evaluate_function_call(node, args_allowed=args_allowed, position=position)
        elif isinstance(node, astroid.IfExp):
            body = self._is_constexpr(node.body, args_allowed=args_allowed)
            orelse = self._is_constexpr(node.orelse, args_allowed=args_allowed)
            if not body or not orelse:
                return False
            else:
                return True
        elif isinstance(node, astroid.Subscript):
            return self._is_constexpr(node.value, args_allowed=args_allowed)
        elif isinstance(node, astroid.BoolOp):
            if node.op == 'or':
                for val in node.values:
                    cst = self._is_constexpr(val, args_allowed=args_allowed)
                    if not cst:
                        return False
                return True
            elif node.op == 'and':
                return self._is_constexpr(node.values[1], args_allowed=args_allowed)
            else:
                return False

        elif isinstance(node, astroid.Attribute):
            attr_chain = self._get_attribute_chain(node)
            while attr_chain != '':
                if attr_chain in ATTRIBUTE_WHITELIST or node.attrname.startswith('_'):
                    return True
                if '.' in attr_chain:
                    attr_chain = attr_chain[attr_chain.index('.')+1:]
                else:
                    attr_chain = ''
            return False

    def _get_cursor_name(self, node):
        expr_list = []
        node_expr = node.expr
        while isinstance(node_expr, astroid.Attribute):
            expr_list.insert(0, node_expr.attrname)
            node_expr = node_expr.expr
        if isinstance(node_expr, astroid.Name):
            expr_list.insert(0, node_expr.name)
        cursor_name = '.'.join(expr_list)
        return cursor_name

    def _allowable(self, node):
        """
        :type node: NodeNG
        """
        infered = utils.safe_infer(node)
        infered_value = self._is_constexpr(node)
        # The package 'psycopg2' must be installed to infer
        # ignore sql.SQL().format or variable that can be infered as constant
        if infered and infered.pytype().startswith('psycopg2'):
            return True
        if infered_value: # If we can infer the value at compile time, it cannot be injected
            return True
        if isinstance(node, astroid.Call):
            node = node.func
        if isinstance(node.scope(), astroid.FunctionDef) and node.scope().name.startswith("_"):
            return True
        # self._thing is OK (mostly self._table), self._thing() also because
        # it's a common pattern of reports (self._select, self._group_by, ...)
        return (isinstance(node, astroid.Attribute)
            and isinstance(node.expr, astroid.Name)
            and node.attrname.startswith('_')
        )

    def _check_concatenation(self, node):
        node = self.resolve(node)

        if self._allowable(node):
            return False

        if isinstance(node, astroid.BinOp) and node.op in ('%', '+'):
            if isinstance(node.right, astroid.Tuple):
                # execute("..." % (self._table, thing))
                if not all(map(self._allowable, node.right.elts)):
                    return True
            elif isinstance(node.right, astroid.Dict):
                # execute("..." % {'table': self._table}
                if not all(self._allowable(v) for _, v in node.right.items):
                    return True
            elif not self._allowable(node.right):
                # execute("..." % self._table)
                return True
            # Consider cr.execute('SELECT ' + operator + ' FROM table' + 'WHERE')"
            # node.repr_tree()
            # BinOp(
            #    op='+',
            #    left=BinOp(
            #       op='+',
            #       left=BinOp(
            #          op='+',
            #          left=Const(value='SELECT '),
            #          right=Name(name='operator')),
            #       right=Const(value=' FROM table')),
            #    right=Const(value='WHERE'))
            # Notice that left node is another BinOp node
            return self._check_concatenation(node.left)

        # check execute("...".format(self._table, table=self._table))
        if isinstance(node, astroid.Call) \
                and isinstance(node.func, astroid.Attribute) \
                and node.func.attrname == 'format':

            return not (
                    all(map(self._allowable, node.args or []))
                and all(self._allowable(keyword.value) for keyword in (node.keywords or []))
            )

        # check execute(f'foo {...}')
        if isinstance(node, astroid.JoinedStr):
            return not all(
                self._allowable(formatted.value)
                for formatted in node.nodes_of_class(astroid.FormattedValue)
            )

    def resolve(self, node):
        # if node is a variable, find how it was built
        if isinstance(node, astroid.Name):
            for target in node.lookup(node.name)[1]:
                # could also be e.g. arguments (if the source is a function parameter)
                if isinstance(target.parent, astroid.Assign):
                    # FIXME: handle multiple results (e.g. conditional assignment)
                    return target.parent.value
        # otherwise just return the original node for checking
        return node

    def _check_sql_injection_risky(self, node):
        # Inspired from OCA/pylint-odoo project
        # Thanks @moylop260 (Moisés López) & @nilshamerlinck (Nils Hamerlinck)
        scope = node.scope()
        fun_name = scope.name if isinstance(scope, astroid.FunctionDef) else None
        if fun_name and not fun_name.startswith('__') and fun_name not in FUNCTION_WHITELIST:
            if  fun_name not in  func_call.keys():#the fun prefix is to avoid overriding __init__ of the dict
                func_call[fun_name] = [scope]
            else:
                if scope not in func_call[fun_name]:
                    func_call[fun_name].append(scope)
        if isinstance(scope, astroid.FunctionDef) and not  fun_name.startswith('__') and fun_name not in FUNCTION_WHITELIST:
            mapped_func_called_for_query = list(map(lambda x: x[0], func_called_for_query))
            if  fun_name in mapped_func_called_for_query:
                index = mapped_func_called_for_query.index(fun_name)
                position = func_called_for_query[index][1]
                func_called_for_query.pop(index)
                for return_node in self._get_return_node(scope):
                    if not self._is_constexpr(return_node.value, position=position):
                        return True

        current_file_bname = os.path.basename(self.linter.current_file)
        if not (
            # .execute() or .executemany()
            isinstance(node, astroid.Call) and node.args and
            isinstance(node.func, astroid.Attribute) and
            node.func.attrname in ('execute', 'executemany') and
            # cursor expr (see above)
            self._get_cursor_name(node.func) in DFTL_CURSOR_EXPR and
            # ignore in test files, probably not accessible
            not current_file_bname.startswith('test_')
        ):
            return False
        first_arg = node.args[0]

        is_concatenation = self._check_concatenation(first_arg)
        if is_concatenation is not None:
            return is_concatenation

        return True

    @checkers.utils.check_messages('sql-injection')
    def visit_call(self, node):
        if self._check_sql_injection_risky(node):
            self.add_message('sql-injection', node=node)


def register(linter):
    linter.register_checker(OdooBaseChecker(linter))
