import re

WORD_REPLACEMENT = {
    "and": "and",
    "or": "or",
    "gt": ">",
    "gte": ">=",
    "lt": "<",
    "lte": "<=",
}

STATIC_TOKEN_MAP = {
    "{": "LEFT_BRACE",
    "}": "RIGHT_BRACE",
    "[": "LEFT_BRACKET",
    "]": "RIGHT_BRACKET",
    "(": "LEFT_PAREN",
    ")": "RIGHT_PAREN",
    ",": "COMMA",
    ":": "COLON",
    ";": "SEMI_COLON",
}

OPERATORS = [
    "...",
    ".",
    "===",
    "==",
    "+",
    "!==",
    "!=",
    "!",
    "||",
    "&&",
    ">=",
    ">",
    "<=",
    "=>",
    "<",
    "?",
    "-",
    "*",
    "/",
    "%",
    "typeof ",
    "=>",
    "=",
    # ";",
    "in ",
    "new ",
    "|",
    "&",
    "^",
    "~",
]

# ------------------------------------------------------------------------------ Tokenizer


class Token:
    def __init__(self, type_, value, size=None):
        self.type = type_
        self.value = value
        self.size = size or len(value)
        self.original_value = value
        self.var_name = None
        self.is_local = False

    def __repr__(self):
        return f'[{self.type}, {self.value}]'


def tokenize_string(expr):
    if expr[0] not in ("'", '"', "`"):
        return None
    quote = expr[0]
    i = 1
    while i < len(expr):
        if expr[i] == "\\":
            i += 2
            continue
        if expr[i] == quote:
            s = expr[: i + 1]
            return Token("TEMPLATE_STRING" if quote == "`" else "VALUE", s)
        i += 1
    raise ValueError("Invalid string literal")


def tokenize_number(expr):
    m = re.match(r"\d+(\.\d+)?", expr)
    if m:
        return Token("VALUE", m.group(0))
    return None


def tokenize_symbol(expr):
    m = re.match(r"[a-zA-Z_$][\w$]*", expr)
    if not m:
        return None
    s = m.group(0)
    if s in ('false', 'true', 'null', 'undefined'):
        return Token('VALUE', s)
    if s in WORD_REPLACEMENT:
        return Token("OPERATOR", s, len(s))
    return Token("SYMBOL", s)


def tokenize_operator(expr):
    for op in OPERATORS:
        if expr.startswith(op):
            return Token("OPERATOR", op)
    return None


def tokenize_static(expr):
    if expr[0] in STATIC_TOKEN_MAP:
        return Token(STATIC_TOKEN_MAP[expr[0]], expr[0])
    return None


def tokenize_whitespace(expr):
    m = re.match(r"\s+", expr)
    if m:
        return Token('WHITESPACE', m.group(0))
    return None


def tokenize_comment(expr):
    i = 0
    expr_len = len(expr)
    if expr[i:i+2] in ('//', '/*'):
        comment_end = '\n' if expr[i:i+2] == '//' else '*/'
        comment_end_len = len(comment_end)
        i += 2
        while i < expr_len and expr[i:i+comment_end_len] != comment_end:
            i += 1
        i += comment_end_len
        return Token('WHITESPACE', expr[0:i])
    return None


TOKENIZERS = [
    tokenize_whitespace,
    tokenize_comment,
    tokenize_string,
    tokenize_number,
    tokenize_operator,
    tokenize_symbol,
    tokenize_static,
]


def tokenize(expr):
    s = expr
    while s:
        for t in TOKENIZERS:
            token = t(s)
            if token:
                s = s[token.size:]
                yield token
                break
        else:
            raise ValueError(f'Tokenizer error near: {s}')


class TokenIterator:
    def __init__(self, expr):
        self.read_count = 0
        self._it = tokenize(expr)
        self._token = None

    def consume(self, token_type):
        token = self.next()
        if token.type != token_type:
            raise ValueError(f"Expected token type '{token_type}' but received '{token.original_value}'")
        return token

    def next(self):
        token = self._token if self._token is not None else next(self._it)
        self.read_count += token.size
        self._token = None
        return token

    def peek(self):
        if self._token is None:
            self._token = next(self._it)
        return self._token


#------------------------------------------------------------------------------ Parser


def skip_spaces(token_iterator: TokenIterator):
    txt = ''

    token = token_iterator.peek()
    while token.type in ('WHITESPACE', 'COMMENT'):
        token_iterator.next()
        txt += token.original_value
        token = token_iterator.peek()

    return token, txt


def parse_array_schema(token_iterator: TokenIterator, ctx: dict):
    expr = parse_expr(token_iterator, ctx)
    if '...' in expr:
        ctx['keep_static'] = True
    if expr == '[]':
        ctx['is_empty'] = True
    if re.search(r'''["']\*["']''', expr):
        ctx['has_all_key'] = True
    expr = re.sub(r'''["']\*["'](\s+,\s+)?''', '', expr)
    return expr


def parse_object_schema_key(token_iterator: TokenIterator, ctx: dict):
    token, full_expr = skip_spaces(token_iterator)
    expr = token.original_value
    full_expr += token.original_value
    token_iterator.next()

    is_string = expr[0] in ('"', "'") and expr[-1] in ('"', "'")
    is_all_key = is_string and expr[1] == '*'

    return full_expr, is_string, is_all_key


def parse_object_schema_value_union(token_iterator: TokenIterator, ctx: dict):
    elements = []

    token_iterator.consume('LEFT_BRACKET')
    token, leading_spaces = skip_spaces(token_iterator)
    while token.type != 'RIGHT_BRACKET':
        full_expr, _ = parse_object_schema_value(token_iterator, True, ctx)
        token, trailing_spaces = skip_spaces(token_iterator)
        full_expr += trailing_spaces

        if token.type == 'COMMA':
            token_iterator.next()
            token, trailing_spaces = skip_spaces(token_iterator)
            full_expr += ',' + trailing_spaces

        elements.append(full_expr)

    token_iterator.consume('RIGHT_BRACKET')

    body = f'{leading_spaces}{''.join(elements)}'
    ctx['uses_t'] = True
    if not body.strip():
        return 't.or([])'
    return f't.or([{body}])'


def parse_object_schema_value_description_key(token_iterator: TokenIterator, ctx: dict):
    token, _ = skip_spaces(token_iterator)
    key = token.original_value
    token_iterator.next()

    if key[0] in ('"', "'") and expr[-1] in ('"', "'"):
        key = key[1:-1]

    return key


def parse_expr(token_iterator: TokenIterator, ctx: dict):
    stack = []
    full_expr = ''
    token = token_iterator.peek()
    while len(stack) or token.type not in ('RIGHT_BRACE', 'COMMA', 'SEMI_COLON'):
        full_expr += token.original_value
        if token.type in ('LEFT_BRACE', 'LEFT_BRACKET', 'LEFT_PAREN'):
            stack.append(token.type)
        elif token.type in ('RIGHT_BRACE', 'RIGHT_BRACKET', 'RIGHT_PAREN'):
            open_token = stack.pop()
            if (token.type == 'RIGHT_BRACE' and open_token != 'LEFT_BRACE') or (token.type == 'RIGHT_BRACKET' and open_token != 'LEFT_BRACKET') or (token.type == 'RIGHT_PAREN' and open_token != 'LEFT_PAREN'):
                raise ValueError('Wrong closing character')
        token_iterator.next()
        token = token_iterator.peek()
    # token_iterator.next()
    return full_expr


def parse_object_schema_value_description(token_iterator: TokenIterator, ctx: dict):
    token_iterator.consume('LEFT_BRACE')
    token, leading_spaces = skip_spaces(token_iterator)

    descr = dict()
    is_optional = False

    while token.type != 'RIGHT_BRACE':
        if token.original_value == '...':
            token_iterator.next()
            raise ValueError(f"Need to check description entry starting with '...{token_iterator.peek().original_value}'")
        key = parse_object_schema_value_description_key(token_iterator, ctx)

        token, _ = skip_spaces(token_iterator)
        token_iterator.consume('COLON')

        if key in ('type', 'values', 'element', 'value'):
            value, is_optional = parse_object_schema_value(token_iterator, key != 'value', ctx)
            descr[key] = value
            if is_optional:
                descr['optional'] = True
        elif key  == 'optional':
            value, _ = parse_object_schema_value(token_iterator, False, ctx)
            descr['optional'] = value
        elif key == 'shape':
            skip_spaces(token_iterator)
            ctx['shape_descr_level'] += 1
            descr['shape'] = parse_object_schema(token_iterator, ctx)
            ctx['shape_descr_level'] -= 1
        elif key == 'validate':
            descr['validate'] = parse_expr(token_iterator, ctx)
        else:
            raise ValueError(f"Unknown description key: '{key}'")

        token, _ = skip_spaces(token_iterator)

        if token.type == 'COMMA':
            token_iterator.next()
            token, _ = skip_spaces(token_iterator)

    token_iterator.consume('RIGHT_BRACE')

    result = 't.any'
    if 'value' in descr:
        result = f't.literal({descr['value'].strip()})'
    elif 'element' in descr:
        result = f't.array({descr['element'].strip()})'
    elif 'shape' in descr:
        result = f't.object({descr['shape'].strip()})'
    elif 'values' in descr:
        result = f't.record({descr['values'].strip()})'
    elif 'type' in descr:
        result = descr['type'].strip()

    if 'validate' in descr:
        result = f't.customValidator({result}, {descr['validate'].strip()})'

    ctx['uses_t'] = True
    return result, descr.get('optional', False)


def parse_object_schema_value_type(token_iterator: TokenIterator, ctx: dict):
    token = token_iterator.next()

    value = ''
    if token_iterator.peek().original_value == '.':
        raise ValueError(f"Need to check schema value type '{token.original_value}.?'")
    else:
        if token.value == 'Boolean':
            value = 't.boolean'
        elif token.value == 'Number':
            value = 't.number'
        elif token.value == 'String':
            value = 't.string'
        elif token.value == 'Function':
            value = 't.function()'
        elif token.value == 'Object':
            value = 't.object()'
        elif token.value == 'Array':
            value = 't.array()'
        else:
            value = f't.instanceOf({token.value})'
        ctx['uses_t'] = True

    return value


def parse_object_schema_value(token_iterator: TokenIterator, replace_any: bool, ctx: dict):
    token, full_expr = skip_spaces(token_iterator)
    is_optional = False
    if token.type == 'LEFT_BRACE':
        descr, is_optional = parse_object_schema_value_description(token_iterator, ctx)
        full_expr += descr
    elif token.type == 'LEFT_BRACKET':
        full_expr += parse_object_schema_value_union(token_iterator, ctx)
    elif token.type == 'VALUE':
        token_iterator.next()
        if replace_any is True:
            if token.original_value in ['true', '"*"', "'*'"]:
                full_expr += 't.any'
                ctx['uses_t'] = True
            else:
                raise ValueError(f"Wrong value type '{token.original_value}'")
        else:
            full_expr += token.original_value
    else:
        full_expr += parse_object_schema_value_type(token_iterator, ctx)

    return full_expr, is_optional


def parse_object_schema(token_iterator: TokenIterator, ctx: dict):
    token_iterator.consume('LEFT_BRACE')
    token, leading_spaces = skip_spaces(token_iterator)

    props = []

    while token.type != 'RIGHT_BRACE':
        is_all_key = False
        entry = ''

        if token_iterator.peek().original_value == '...':
            ctx['keep_static'] = True
            entry += token_iterator.next().original_value
            token, spaces = skip_spaces(token_iterator)
            entry += spaces
            if token.type != 'SYMBOL':
                raise ValueError(f"Unsupported syntax '...{token.original_value}'")
            while token_iterator.peek().type not in ('RIGHT_BRACE', 'COMMA'):
                entry += token_iterator.next().original_value
                token, spaces = skip_spaces(token_iterator)
                entry += spaces
        else:
            key, is_string_key, is_all_key = parse_object_schema_key(token_iterator, ctx)

            token, spaces_before_colon = skip_spaces(token_iterator)
            token_iterator.consume('COLON')

            value, is_optional = parse_object_schema_value(token_iterator, True, ctx)
            token, trailing_spaces = skip_spaces(token_iterator)

            if is_optional:
                if is_string_key:
                    quote = key[0]
                    if key[-2] != '?':
                        key = f'{quote}{key[1:-1]}?{quote}'
                else:
                    key = f'"{key}?"'
            entry = f'{key}{spaces_before_colon}:{value}{trailing_spaces}'

        if token.type == 'COMMA':
            token_iterator.next()
            token, trailing_spaces = skip_spaces(token_iterator)
            entry += ',' + trailing_spaces

        if not is_all_key:
            props.append(entry)
        else:
            ctx['has_all_key'] = ctx['shape_descr_level'] == 0  # do not set this key if inside shape descr

    token_iterator.consume('RIGHT_BRACE')

    body = f'{leading_spaces}{''.join(props)}'
    if not body.strip():
        ctx['is_empty'] = not ctx['has_all_key']
        return '{}'
    return f'{{{body}}}'


def parse_schema(content):
    token_iterator = TokenIterator(content)

    ctx = {
        'uses_t': False,
        'succeed': False,
        'keep_static': False,
        'is_empty': False,
        'has_all_key': False,
        'error': None,
        'shape_descr_level': 0,
    }

    token, leading_spaces = skip_spaces(token_iterator)
    new_value = ''
    try:
        if token.type == 'LEFT_BRACKET':
            ctx['new_value'] = leading_spaces + parse_array_schema(token_iterator, ctx)
            ctx['succeed'] = True
        elif token.type == 'LEFT_BRACE':
            ctx['new_value'] = leading_spaces + parse_object_schema(token_iterator, ctx)
            ctx['succeed'] = True
        elif token.type == 'SYMBOL':
            ctx['new_value'] = leading_spaces + parse_expr(token_iterator, ctx)
            ctx['succeed'] = True
    except Exception as e:  # noqa: BLE001
        ctx['error'] = e

    if token_iterator.peek().type == 'SEMI_COLON':
        token_iterator.next()

    ctx['read_count'] = token_iterator.read_count
    del ctx['shape_descr_level']
    return ctx


def parse_default_props(content):
    token_iterator = TokenIterator(content)
    expr = parse_expr(token_iterator, {})
    if token_iterator.peek().type == 'SEMI_COLON':
        token_iterator.next()
    return {
        'expr': expr,
        'read_count': token_iterator.read_count,
        'keep_static': '...' in expr,
    }


############################################################################### Tests


tests = []
def test(name, input, expected):
    tests.append({'name': name, 'input': input, 'expected': expected})


#------------------------------------------------------------------------------ symbol tests


test(
    """object schema: starts with symbol""",
    """standardFieldProps""",
    """standardFieldProps""",
)


#------------------------------------------------------------------------------ array schema tests


test(
    'array schema: simple case',
    """[...other, "a", "slots?"]""",
    """[...other, "a", "slots?"]""",
)

test(
    'array schema: whitespace',
    """[        ...other  ,     "a","slots?"              ]""",
    """[        ...other  ,     "a","slots?"              ]""",
)

test(
    'array schema: multiple lines',
    """[
        ...other,
        "a",
        "slots?",
    ]""",
    """[
        ...other,
        "a",
        "slots?",
    ]""",
)

test(
    'array schema: comment',
    """[...other, /* this is a comment */ "a", "slots?"]""",
    """[...other, /* this is a comment */ "a", "slots?"]""",
)

test(
    'array schema: remove "*" key',
    """[...other, "a", "slots?", "*"]""",
    """[...other, "a", "slots?"]""",
)


#------------------------------------------------------------------------------ object schema test

test(
    """object schema: simple case""",
    """{ a: String, b: Boolean }""",
    """{ a: t.string, b: t.boolean }""",
)

test(
    """object schema: whitespace""",
    """{   a               :Boolean               }""",
    """{   a               :t.boolean               }""",
)

test(
    """object schema: multiple line""",
    """{
        a: String,
        b: Boolean,
    }""",
    """{
        a: t.string,
        b: t.boolean,
    }""",
)

test(
    """object schema: simple quoted key""",
    """{ 'a': String }""",
    """{ 'a': t.string }""",
)

test(
    """object schema: double quoted key""",
    """{ "a": String }""",
    """{ "a": t.string }""",
)

test(
    """object schema: key with ?""",
    """{ "a?": String }""",
    """{ "a?": t.string }""",
)

test(
    """object schema: replace String by t.string""",
    """{ a: String }""",
    """{ a: t.string }""",
)

test(
    """object schema: replace Boolean by t.boolean""",
    """{ a: Boolean }""",
    """{ a: t.boolean }""",
)

test(
    """object schema: replace Number by t.number""",
    """{ a: Number }""",
    """{ a: t.number }""",
)

test(
    """object schema: replace Function by t.function()""",
    """{ a: Function }""",
    """{ a: t.function() }""",
)

test(
    """object schema: replace true by t.any""",
    """{ a: true }""",
    """{ a: t.any }""",
)

test(
    """object schema: replace value '*' by t.any""",
    """{ a: "*" }""",
    """{ a: t.any }""",
)

test(
    """object schema: replace value "*" by t.any""",
    """{ a: '*' }""",
    """{ a: t.any }""",
)

test(
    """object schema: remove "*" key""",
    """{ "*": true }""",
    """{}""",
)

test(
    """object schema: remove '*' key""",
    """{ '*': true }""",
    """{}""",
)

test(
    """object schema: remove '*' key with value description""",
    """{ "*": { optional: true }, a: Number }""",
    """{ a: t.number }""",
)

test(
    """object schema: empty union""",
    """{ a: [] }""",
    """{ a: t.or([]) }""",
)

test(
    """object schema: empty union with spaces""",
    """{ a: [ ] }""",
    """{ a: t.or([]) }""",
)

test(
    """object schema: union with 1 element""",
    """{ a: [String] }""",
    """{ a: t.or([t.string]) }""",
)

test(
    """object schema: union with x elements""",
    """{ a: [  String, Boolean,Number   ] }""",
    """{ a: t.or([  t.string, t.boolean,t.number   ]) }""",
)

test(
    """object schema: object description: empty object""",
    """{ a: {} }""",
    """{ a: t.any }""",
)

test(
    """object schema: object description: string value""",
    """{ a: { value: "abc" } }""",
    """{ a: t.literal("abc") }""",
)

test(
    """object schema: object description: number value""",
    """{ a: { value: 123 } }""",
    """{ a: t.literal(123) }""",
)

test(
    """object schema: object description: type Boolean""",
    """{ a: { type: Boolean } }""",
    """{ a: t.boolean }""",
)

test(
    """object schema: object description: type String""",
    """{ a: { type: String } }""",
    """{ a: t.string }""",
)

test(
    """object schema: object description: type Date""",
    """{ a: { type: Date } }""",
    """{ a: t.instanceOf(Date) }""",
)

test(
    """object schema: object description: type true""",
    """{ a: { type: true } }""",
    """{ a: t.any }""",
)

test(
    """object schema: object description: type '*'""",
    """{ a: { type: '*' } }""",
    """{ a: t.any }""",
)

test(
    """object schema: object description: array element any""",
    """{ a: { element: true } }""",
    """{ a: t.array(t.any) }""",
)

test(
    """object schema: object description: array element Number""",
    """{ a: { element: Number } }""",
    """{ a: t.array(t.number) }""",
)

test(
    """object schema: object description: array element Date""",
    """{ a: { element: Date } }""",
    """{ a: t.array(t.instanceOf(Date)) }""",
)

test(
    """object schema: object description: record values any""",
    """{ a: { values: true } }""",
    """{ a: t.record(t.any) }""",
)

test(
    """object schema: object description: record values Number""",
    """{ a: { values: Number } }""",
    """{ a: t.record(t.number) }""",
)

test(
    """object schema: object description: record values Date""",
    """{ a: { values: Date } }""",
    """{ a: t.record(t.instanceOf(Date)) }""",
)

test(
    """object schema: object description: optional""",
    """{ a: { optional: true } }""",
    """{ "a?": t.any }""",
)

test(
    """object schema: object description: optional, key string""",
    """{ "a": { optional: true } }""",
    """{ "a?": t.any }""",
)

test(
    """object schema: object description: key already optional""",
    """{ "a?": { optional: true } }""",
    """{ "a?": t.any }""",
)

test(
    """object schema: object description: record shape empty""",
    """{ a: { shape: {} } }""",
    """{ a: t.object({}) }""",
)

test(
    """object schema: object description: record shape with keys""",
    """{
        a: {
            shape: {
                a: Number,
                b: Date,
                c: true,
            },
        },
    }""",
    """{
        a: t.object({
                a: t.number,
                b: t.instanceOf(Date),
                c: t.any,
            }),
    }""",
)

test(
    """object schema: object description: record shape with keys""",
    """{
        a: {
            shape: {
                a: Number,
                b: Date,
                c: true,
            },
        },
    }""",
    """{
        a: t.object({
                a: t.number,
                b: t.instanceOf(Date),
                c: t.any,
            }),
    }""",
)

test(
    """object schema: object description: validate""",
    """{ a: { validate: (value) => value === 1 } }""",
    """{ a: t.customValidator(t.any, (value) => value === 1) }""",
)

test(
    """object schema: object description: validate with type""",
    """{ a: { type: Number, validate: (value) => value === 1 } }""",
    """{ a: t.customValidator(t.number, (value) => value === 1) }""",
)


############################################################################### Test runner


WHITELIST = []


if __name__ == "__main__":
    total_success = 0
    total_fail = 0

    for test in tests:
        name = test['name']
        if WHITELIST and name not in WHITELIST:
            continue

        input = test['input']
        expected = test['expected']

        output = None
        try:
            output = parse_schema(input)['new_value']
        except Exception as e:  # noqa: BLE001
            output = str(e)
            raise e
        finally:
            if output != expected:
                total_fail += 1
                print(f"{name}: fail")  # noqa: T201
                print("Expected:")  # noqa: T201
                print(test["expected"])  # noqa: T201
                print("Output:")  # noqa: T201
                print(output)  # noqa: T201
            else:
                total_success += 1

    if not total_fail:
        print(f"Yep, {total_success} tests passed")  # noqa: T201
