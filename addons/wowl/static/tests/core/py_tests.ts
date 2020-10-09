import { AST_TYPE, evaluateExpr, parseExpr, tokenize, TOKEN_TYPE } from "../../src/core/py/index";

QUnit.module("py", {}, () => {
  QUnit.module("tokenizer");

  QUnit.test("can tokenize simple expressions with spaces", (assert) => {
    assert.deepEqual(tokenize("1"), [{ type: TOKEN_TYPE.Number, value: 1 }]);
    assert.deepEqual(tokenize(" 1"), [{ type: TOKEN_TYPE.Number, value: 1 }]);
    assert.deepEqual(tokenize(" 1 "), [{ type: TOKEN_TYPE.Number, value: 1 }]);
  });

  QUnit.test("can tokenize numbers", (assert) => {
    assert.deepEqual(tokenize("1"), [{ type: TOKEN_TYPE.Number, value: 1 }]);
    assert.deepEqual(tokenize("13"), [{ type: TOKEN_TYPE.Number, value: 13 }]);
    assert.deepEqual(tokenize("12.0"), [{ type: TOKEN_TYPE.Number, value: 12 }]);
    assert.deepEqual(tokenize("1.2"), [{ type: TOKEN_TYPE.Number, value: 1.2 }]);
    assert.deepEqual(tokenize("1.2"), [{ type: TOKEN_TYPE.Number, value: 1.2 }]);
    assert.deepEqual(tokenize(".42"), [{ type: TOKEN_TYPE.Number, value: 0.42 }]);

    assert.deepEqual(tokenize("-1"), [
      { type: TOKEN_TYPE.Symbol, value: "-" },
      { type: TOKEN_TYPE.Number, value: 1 },
    ]);
  });

  QUnit.test("can tokenize strings", (assert) => {
    assert.deepEqual(tokenize('"foo"'), [{ type: TOKEN_TYPE.String, value: "foo" }]);
  });

  QUnit.test("can tokenize bare names", (assert) => {
    assert.deepEqual(tokenize("foo"), [{ type: TOKEN_TYPE.Name, value: "foo" }]);
  });

  QUnit.test("can tokenize misc operators", (assert) => {
    assert.deepEqual(tokenize("in"), [{ type: TOKEN_TYPE.Symbol, value: "in" }]);
    assert.deepEqual(tokenize("not in"), [{ type: TOKEN_TYPE.Symbol, value: "not in" }]);
    assert.deepEqual(tokenize("3 ** 2")[1], { type: TOKEN_TYPE.Symbol, value: "**" });
  });

  QUnit.test("can tokenize constants", (assert) => {
    assert.deepEqual(tokenize("None"), [{ type: TOKEN_TYPE.Constant, value: "None" }]);
    assert.deepEqual(tokenize("True"), [{ type: TOKEN_TYPE.Constant, value: "True" }]);
    assert.deepEqual(tokenize("False"), [{ type: TOKEN_TYPE.Constant, value: "False" }]);
  });

  QUnit.test("can tokenize parenthesis", (assert) => {
    assert.deepEqual(tokenize("()"), [
      { type: TOKEN_TYPE.Symbol, value: "(" },
      { type: TOKEN_TYPE.Symbol, value: ")" },
    ]);
  });

  QUnit.test("can tokenize function with kwargs", (assert) => {
    assert.deepEqual(tokenize('foo(bar=3, qux="4")'), [
      { type: TOKEN_TYPE.Name, value: "foo" },
      { type: TOKEN_TYPE.Symbol, value: "(" },
      { type: TOKEN_TYPE.Name, value: "bar" },
      { type: TOKEN_TYPE.Symbol, value: "=" },
      { type: TOKEN_TYPE.Number, value: 3 },
      { type: TOKEN_TYPE.Symbol, value: "," },
      { type: TOKEN_TYPE.Name, value: "qux" },
      { type: TOKEN_TYPE.Symbol, value: "=" },
      { type: TOKEN_TYPE.String, value: "4" },
      { type: TOKEN_TYPE.Symbol, value: ")" },
    ]);
  });

  QUnit.test("can tokenize if statement", (assert) => {
    assert.deepEqual(tokenize("1 if True else 2"), [
      { type: TOKEN_TYPE.Number, value: 1 },
      { type: TOKEN_TYPE.Symbol, value: "if" },
      { type: TOKEN_TYPE.Constant, value: "True" },
      { type: TOKEN_TYPE.Symbol, value: "else" },
      { type: TOKEN_TYPE.Number, value: 2 },
    ]);
  });

  QUnit.module("parser");

  QUnit.test("can parse basic elements", (assert) => {
    assert.deepEqual(parseExpr("1"), { type: AST_TYPE.Number, value: 1 });
    assert.deepEqual(parseExpr('"foo"'), { type: AST_TYPE.String, value: "foo" });
    assert.deepEqual(parseExpr("foo"), { type: AST_TYPE.Name, value: "foo" });
    assert.deepEqual(parseExpr("True"), { type: AST_TYPE.Boolean, value: true });
    assert.deepEqual(parseExpr("False"), { type: AST_TYPE.Boolean, value: false });
    assert.deepEqual(parseExpr("None"), { type: AST_TYPE.None });
  });

  QUnit.test("can parse unary operator -", (assert) => {
    assert.deepEqual(parseExpr("-1"), {
      type: AST_TYPE.UnaryOperator,
      op: "-",
      right: { type: AST_TYPE.Number, value: 1 },
    });
    assert.deepEqual(parseExpr("-foo"), {
      type: AST_TYPE.UnaryOperator,
      op: "-",
      right: { type: AST_TYPE.Name, value: "foo" },
    });

    assert.deepEqual(parseExpr("not True"), {
      type: AST_TYPE.UnaryOperator,
      op: "not",
      right: { type: AST_TYPE.Boolean, value: true },
    });
  });

  QUnit.test("can parse parenthesis", (assert) => {
    assert.deepEqual(parseExpr("(1 + 2)"), {
      type: AST_TYPE.BinaryOperator,
      op: "+",
      left: { type: AST_TYPE.Number, value: 1 },
      right: { type: AST_TYPE.Number, value: 2 },
    });
  });

  QUnit.test("can parse binary operators", (assert) => {
    assert.deepEqual(parseExpr("1 < 2"), {
      type: AST_TYPE.BinaryOperator,
      op: "<",
      left: { type: AST_TYPE.Number, value: 1 },
      right: { type: AST_TYPE.Number, value: 2 },
    });
    assert.deepEqual(parseExpr('a + "foo"'), {
      type: AST_TYPE.BinaryOperator,
      op: "+",
      left: { type: AST_TYPE.Name, value: "a" },
      right: { type: AST_TYPE.String, value: "foo" },
    });
  });

  QUnit.test("can parse boolean operators", (assert) => {
    assert.deepEqual(parseExpr('True and "foo"'), {
      type: AST_TYPE.BooleanOperator,
      op: "and",
      left: { type: AST_TYPE.Boolean, value: true },
      right: { type: AST_TYPE.String, value: "foo" },
    });
    assert.deepEqual(parseExpr('True or "foo"'), {
      type: AST_TYPE.BooleanOperator,
      op: "or",
      left: { type: AST_TYPE.Boolean, value: true },
      right: { type: AST_TYPE.String, value: "foo" },
    });
  });

  QUnit.test("expression with == and or", (assert) => {
    assert.deepEqual(parseExpr("False == True and False"), {
      type: AST_TYPE.BooleanOperator,
      op: "and",
      left: {
        type: AST_TYPE.BinaryOperator,
        op: "==",
        left: { type: AST_TYPE.Boolean, value: false },
        right: { type: AST_TYPE.Boolean, value: true },
      },
      right: { type: AST_TYPE.Boolean, value: false },
    });
  });

  QUnit.test("can parse chained comparisons", (assert) => {
    assert.deepEqual(parseExpr("1 < 2 <= 3"), {
      type: AST_TYPE.BooleanOperator,
      op: "and",
      left: {
        type: AST_TYPE.BinaryOperator,
        op: "<",
        left: { type: AST_TYPE.Number, value: 1 },
        right: { type: AST_TYPE.Number, value: 2 },
      },
      right: {
        type: AST_TYPE.BinaryOperator,
        op: "<=",
        left: { type: AST_TYPE.Number, value: 2 },
        right: { type: AST_TYPE.Number, value: 3 },
      },
    });

    assert.deepEqual(parseExpr("1 < 2 <= 3 > 33"), {
      type: AST_TYPE.BooleanOperator,
      op: "and",
      left: {
        type: AST_TYPE.BooleanOperator,
        op: "and",
        left: {
          type: AST_TYPE.BinaryOperator,
          op: "<",
          left: { type: AST_TYPE.Number, value: 1 },
          right: { type: AST_TYPE.Number, value: 2 },
        },
        right: {
          type: AST_TYPE.BinaryOperator,
          op: "<=",
          left: { type: AST_TYPE.Number, value: 2 },
          right: { type: AST_TYPE.Number, value: 3 },
        },
      },
      right: {
        type: AST_TYPE.BinaryOperator,
        op: ">",
        left: { type: AST_TYPE.Number, value: 3 },
        right: { type: AST_TYPE.Number, value: 33 },
      },
    });
  });

  QUnit.test("can parse lists", (assert) => {
    assert.deepEqual(parseExpr("[]"), {
      type: AST_TYPE.List,
      value: [],
    });
    assert.deepEqual(parseExpr("[1]"), {
      type: AST_TYPE.List,
      value: [{ type: AST_TYPE.Number, value: 1 }],
    });
    assert.deepEqual(parseExpr("[1,]"), {
      type: AST_TYPE.List,
      value: [{ type: AST_TYPE.Number, value: 1 }],
    });
    assert.deepEqual(parseExpr("[1, 4]"), {
      type: AST_TYPE.List,
      value: [
        { type: AST_TYPE.Number, value: 1 },
        { type: AST_TYPE.Number, value: 4 },
      ],
    });
    assert.throws(() => parseExpr("[1 1]"));
  });

  QUnit.test("can parse lists lookup", (assert) => {
    assert.deepEqual(parseExpr("[1,2][1]"), {
      type: AST_TYPE.Lookup,
      target: {
        type: AST_TYPE.List,
        value: [
          { type: AST_TYPE.Number, value: 1 },
          { type: AST_TYPE.Number, value: 2 },
        ],
      },
      key: { type: AST_TYPE.Number, value: 1 },
    });
  });

  QUnit.test("can parse tuples", (assert) => {
    assert.deepEqual(parseExpr("()"), {
      type: AST_TYPE.Tuple,
      value: [],
    });
    assert.deepEqual(parseExpr("(1,)"), {
      type: AST_TYPE.Tuple,
      value: [{ type: AST_TYPE.Number, value: 1 }],
    });
    assert.deepEqual(parseExpr("(1,4)"), {
      type: AST_TYPE.Tuple,
      value: [
        { type: AST_TYPE.Number, value: 1 },
        { type: AST_TYPE.Number, value: 4 },
      ],
    });

    assert.throws(() => parseExpr("(1 1)"));
  });

  QUnit.test("can parse dictionary", (assert) => {
    assert.deepEqual(parseExpr("{}"), {
      type: AST_TYPE.Dictionary,
      value: {},
    });
    assert.deepEqual(parseExpr("{'foo': 1}"), {
      type: AST_TYPE.Dictionary,
      value: { foo: { type: AST_TYPE.Number, value: 1 } },
    });
    assert.deepEqual(parseExpr("{'foo': 1, 'bar': 3}"), {
      type: AST_TYPE.Dictionary,
      value: {
        foo: { type: AST_TYPE.Number, value: 1 },
        bar: { type: AST_TYPE.Number, value: 3 },
      },
    });
    assert.deepEqual(parseExpr("{1: 2}"), {
      type: AST_TYPE.Dictionary,
      value: { 1: { type: AST_TYPE.Number, value: 2 } },
    });
  });

  QUnit.test("can parse dictionary lookup", (assert) => {
    assert.deepEqual(parseExpr("{}['a']"), {
      type: AST_TYPE.Lookup,
      target: { type: AST_TYPE.Dictionary, value: {} },
      key: { type: AST_TYPE.String, value: "a" },
    });
  });

  QUnit.test("can parse assignment", (assert) => {
    assert.deepEqual(parseExpr("a=1"), {
      type: AST_TYPE.Assignment,
      name: { type: AST_TYPE.Name, value: "a" },
      value: { type: AST_TYPE.Number, value: 1 },
    });
  });

  QUnit.test("can parse function calls", (assert) => {
    assert.deepEqual(parseExpr("f()"), {
      type: AST_TYPE.FunctionCall,
      fn: { type: AST_TYPE.Name, value: "f" },
      args: [],
      kwargs: {},
    });

    assert.deepEqual(parseExpr("f() + 2"), {
      type: AST_TYPE.BinaryOperator,
      op: "+",
      left: {
        type: AST_TYPE.FunctionCall,
        fn: { type: AST_TYPE.Name, value: "f" },
        args: [],
        kwargs: {},
      },
      right: { type: AST_TYPE.Number, value: 2 },
    });

    assert.deepEqual(parseExpr("f(1)"), {
      type: AST_TYPE.FunctionCall,
      fn: { type: AST_TYPE.Name, value: "f" },
      args: [{ type: AST_TYPE.Number, value: 1 }],
      kwargs: {},
    });

    assert.deepEqual(parseExpr("f(1, 2)"), {
      type: AST_TYPE.FunctionCall,
      fn: { type: AST_TYPE.Name, value: "f" },
      args: [
        { type: AST_TYPE.Number, value: 1 },
        { type: AST_TYPE.Number, value: 2 },
      ],
      kwargs: {},
    });
  });

  QUnit.test("can parse function calls with kwargs", (assert) => {
    assert.deepEqual(parseExpr("f(a = 1)"), {
      type: AST_TYPE.FunctionCall,
      fn: { type: AST_TYPE.Name, value: "f" },
      args: [],
      kwargs: { a: { type: AST_TYPE.Number, value: 1 } },
    });

    assert.deepEqual(parseExpr("f(3, a = 1)"), {
      type: AST_TYPE.FunctionCall,
      fn: { type: AST_TYPE.Name, value: "f" },
      args: [{ type: AST_TYPE.Number, value: 3 }],
      kwargs: { a: { type: AST_TYPE.Number, value: 1 } },
    });
  });

  QUnit.test("can parse not a in b", (assert) => {
    assert.deepEqual(parseExpr("not a in b"), {
      type: AST_TYPE.UnaryOperator,
      op: "not",
      right: {
        type: AST_TYPE.BinaryOperator,
        op: "in",
        left: { type: AST_TYPE.Name, value: "a" },
        right: { type: AST_TYPE.Name, value: "b" },
      },
    });

    assert.deepEqual(parseExpr("a.b.c"), {
      type: AST_TYPE.ObjLookup,
      obj: {
        type: AST_TYPE.ObjLookup,
        obj: { type: AST_TYPE.Name, value: "a" },
        key: "b",
      },
      key: "c",
    });
  });

  QUnit.test("can parse if statement", (assert) => {
    assert.deepEqual(parseExpr("1 if True else 2"), {
      type: AST_TYPE.If,
      condition: { type: AST_TYPE.Boolean, value: true },
      ifTrue: { type: AST_TYPE.Number, value: 1 },
      ifFalse: { type: AST_TYPE.Number, value: 2 },
    });

    assert.deepEqual(parseExpr("1 + 1 if True else 2"), {
      type: AST_TYPE.If,
      condition: { type: AST_TYPE.Boolean, value: true },
      ifTrue: {
        type: AST_TYPE.BinaryOperator,
        op: "+",
        left: { type: AST_TYPE.Number, value: 1 },
        right: { type: AST_TYPE.Number, value: 1 },
      },
      ifFalse: { type: AST_TYPE.Number, value: 2 },
    });
  });

  QUnit.module("interpreter", () => {
    QUnit.module("basic values");

    QUnit.test("evaluate simple values", (assert) => {
      assert.strictEqual(evaluateExpr("12"), 12);
      assert.strictEqual(evaluateExpr('"foo"'), "foo");
    });

    QUnit.test("numbers", (assert) => {
      assert.strictEqual(evaluateExpr("1.2"), 1.2);
      assert.strictEqual(evaluateExpr(".12"), 0.12);
      assert.strictEqual(evaluateExpr("0"), 0);
      assert.strictEqual(evaluateExpr("1.0"), 1);
      assert.strictEqual(evaluateExpr("-1.2"), -1.2);
      assert.strictEqual(evaluateExpr("-12"), -12);
      assert.strictEqual(evaluateExpr("+12"), 12);
    });

    QUnit.test("strings", (assert) => {
      assert.strictEqual(evaluateExpr('""'), "");
      assert.strictEqual(evaluateExpr('"foo"'), "foo");
      assert.strictEqual(evaluateExpr("'foo'"), "foo");
    });

    QUnit.test("boolean", (assert) => {
      assert.strictEqual(evaluateExpr("True"), true);
      assert.strictEqual(evaluateExpr("False"), false);
    });

    QUnit.test("lists", (assert) => {
      assert.deepEqual(evaluateExpr("[]"), []);
      assert.deepEqual(evaluateExpr("[1]"), [1]);
      assert.deepEqual(evaluateExpr("[1,2]"), [1, 2]);
      assert.deepEqual(evaluateExpr("[1,False, None, 'foo']"), [1, false, null, "foo"]);
      assert.deepEqual(evaluateExpr("[1,2 + 3]"), [1, 5]);
      assert.deepEqual(evaluateExpr("[1,2, 3][1]"), 2);
    });

    QUnit.test("None", (assert) => {
      assert.strictEqual(evaluateExpr("None"), null);
    });

    QUnit.test("Tuples", (assert) => {
      assert.deepEqual(evaluateExpr("()"), []);
      assert.deepEqual(evaluateExpr("(1,)"), [1]);
      assert.deepEqual(evaluateExpr("(1,2)"), [1, 2]);
    });

    QUnit.test("strings can be concatenated", (assert) => {
      assert.strictEqual(evaluateExpr('"foo" + "bar"'), "foobar");
    });

    QUnit.module("number properties");

    QUnit.test("number arithmetic", (assert) => {
      assert.strictEqual(evaluateExpr("1 + 2"), 3);
      assert.strictEqual(evaluateExpr("4 - 2"), 2);
      assert.strictEqual(evaluateExpr("4 * 2"), 8);
      assert.strictEqual(evaluateExpr("1.5 + 2"), 3.5);
      assert.strictEqual(evaluateExpr("1 + -1"), 0);
      assert.strictEqual(evaluateExpr("1 - 1"), 0);
      assert.strictEqual(evaluateExpr("1.5 - 2"), -0.5);
      assert.strictEqual(evaluateExpr("0 * 5"), 0);
      assert.strictEqual(evaluateExpr("1 + 3 * 5"), 16);
      assert.strictEqual(evaluateExpr("42 * -2"), -84);
      assert.strictEqual(evaluateExpr("1 / 2"), 0.5);
      assert.strictEqual(evaluateExpr("2 / 1"), 2);
      assert.strictEqual(evaluateExpr("42 % 5"), 2);
      assert.strictEqual(evaluateExpr("2 ** 3"), 8);
    });

    QUnit.test("// operator", (assert) => {
      assert.strictEqual(evaluateExpr("1 // 2"), 0);
      assert.strictEqual(evaluateExpr("1 // -2"), -1);
      assert.strictEqual(evaluateExpr("-1 // 2"), -1);
      assert.strictEqual(evaluateExpr("6 // 2"), 3);
    });

    QUnit.module("boolean properties");

    QUnit.test("boolean arithmetic", (assert) => {
      assert.strictEqual(evaluateExpr("True and False"), false);
      assert.strictEqual(evaluateExpr("True or False"), true);
      assert.strictEqual(evaluateExpr("True and (False or True)"), true);
      assert.strictEqual(evaluateExpr("not True"), false);
      assert.strictEqual(evaluateExpr("not False"), true);
      assert.strictEqual(evaluateExpr("not None"), true);
      assert.strictEqual(evaluateExpr("True == False or True == True"), true);
      assert.strictEqual(evaluateExpr("False == True and False"), false);
    });

    QUnit.test("get value from context", (assert) => {
      assert.strictEqual(evaluateExpr("foo == 'foo' or foo == 'bar'", { foo: "bar" }), true);
      assert.strictEqual(
        evaluateExpr("foo == 'foo' and bar == 'bar'", { foo: "foo", bar: "bar" }),
        true
      );
    });

    QUnit.test("should be lazy", (assert) => {
      // second clause should nameerror if evaluated
      assert.throws(() => evaluateExpr("foo == 'foo' and bar == 'bar'", { foo: "foo" }));

      assert.strictEqual(evaluateExpr("foo == 'foo' and bar == 'bar'", { foo: "bar" }), false);
      assert.strictEqual(evaluateExpr("foo == 'foo' or bar == 'bar'", { foo: "foo" }), true);
    });

    QUnit.test("should return the actual object", (assert) => {
      assert.strictEqual(evaluateExpr('"foo" or "bar'), "foo");
      assert.strictEqual(evaluateExpr('None or "bar"'), "bar");
      assert.strictEqual(evaluateExpr("False or None"), null);
      assert.strictEqual(evaluateExpr("0 or 1"), 1);
    });

    QUnit.module("values from context");

    QUnit.test("free variable", (assert) => {
      assert.strictEqual(evaluateExpr("a", { a: 3 }), 3);
      assert.strictEqual(evaluateExpr("a + b", { a: 3, b: 5 }), 8);

      assert.strictEqual(evaluateExpr("a", { a: true }), true);
      assert.strictEqual(evaluateExpr("a", { a: false }), false);

      assert.strictEqual(evaluateExpr("a", { a: null }), null);

      assert.strictEqual(evaluateExpr("a", { a: "bar" }), "bar");

      assert.deepEqual(evaluateExpr("foo", { foo: [1, 2, 3] }), [1, 2, 3]);
    });

    QUnit.test("throw error if name is not defined", (assert) => {
      assert.throws(() => evaluateExpr("a"));
    });

    QUnit.module("comparisons");

    QUnit.test("equality", (assert) => {
      assert.strictEqual(evaluateExpr("1 == 1"), true);
      assert.strictEqual(evaluateExpr('"foo" == "foo"'), true);
      assert.strictEqual(evaluateExpr('"foo" == "bar"'), false);
      assert.strictEqual(evaluateExpr("1 == True"), true);
      assert.strictEqual(evaluateExpr("True == 1"), true);
      assert.strictEqual(evaluateExpr("1 == False"), false);
      assert.strictEqual(evaluateExpr("False == 1"), false);
      assert.strictEqual(evaluateExpr("0 == False"), true);
      assert.strictEqual(evaluateExpr("False == 0"), true);
      assert.strictEqual(evaluateExpr("None == None"), true);
      assert.strictEqual(evaluateExpr("None == False"), false);
    });

    QUnit.test("equality should work with free variables", (assert) => {
      assert.strictEqual(evaluateExpr("1 == a", { a: 1 }), true);
      assert.strictEqual(evaluateExpr('foo == "bar"', { foo: "bar" }), true);
      assert.strictEqual(evaluateExpr('foo == "bar"', { foo: "qux" }), false);
    });

    QUnit.test("inequality", (assert) => {
      assert.strictEqual(evaluateExpr("1 != 2"), true);
      assert.strictEqual(evaluateExpr('"foo" != "foo"'), false);
      assert.strictEqual(evaluateExpr('"foo" != "bar"'), true);
    });

    QUnit.test("inequality should work with free variables", (assert) => {
      assert.strictEqual(evaluateExpr("1 != a", { a: 42 }), true);
      assert.strictEqual(evaluateExpr('foo != "bar"', { foo: "bar" }), false);
      assert.strictEqual(evaluateExpr('foo != "bar"', { foo: "qux" }), true);
      assert.strictEqual(evaluateExpr("foo != bar", { foo: "qux", bar: "quux" }), true);
    });

    QUnit.test("should accept deprecated form", (assert) => {
      assert.strictEqual(evaluateExpr("1 <> 2"), true);
      assert.strictEqual(evaluateExpr('"foo" <> "foo"'), false);
      assert.strictEqual(evaluateExpr('"foo" <> "bar"'), true);
    });

    QUnit.test("comparing numbers", (assert) => {
      assert.strictEqual(evaluateExpr("3 < 5"), true);
      assert.strictEqual(evaluateExpr("3 > 5"), false);
      assert.strictEqual(evaluateExpr("5 >= 3"), true);
      assert.strictEqual(evaluateExpr("3 >= 3"), true);
      assert.strictEqual(evaluateExpr("3 <= 5"), true);
      assert.strictEqual(evaluateExpr("5 <= 3"), false);
    });

    QUnit.test("should support comparison chains", (assert) => {
      assert.strictEqual(evaluateExpr("1 < 3 < 5"), true);
      assert.strictEqual(evaluateExpr("5 > 3 > 1"), true);
      assert.strictEqual(evaluateExpr("1 < 3 > 2 == 2 > -2"), true);
      assert.strictEqual(evaluateExpr("1 < 2 < 3 < 4 < 5 < 6"), true);
    });

    QUnit.test("should compare strings", (assert) => {
      assert.strictEqual(
        evaluateExpr("date >= current", { date: "2010-06-08", current: "2010-06-05" }),
        true
      );
      assert.strictEqual(evaluateExpr('state >= "cancel"', { state: "cancel" }), true);
      assert.strictEqual(evaluateExpr('state >= "cancel"', { state: "open" }), true);
    });

    QUnit.test("mixed types comparisons", (assert) => {
      assert.strictEqual(evaluateExpr("None < 42"), true);
      assert.strictEqual(evaluateExpr("None > 42"), false);
      assert.strictEqual(evaluateExpr("42 > None"), true);

      assert.strictEqual(evaluateExpr("None < False"), true);
      assert.strictEqual(evaluateExpr("None < True"), true);
      assert.strictEqual(evaluateExpr("False > None"), true);
      assert.strictEqual(evaluateExpr("True > None"), true);
      assert.strictEqual(evaluateExpr("None > False"), false);
      assert.strictEqual(evaluateExpr("None > True"), false);
      assert.strictEqual(evaluateExpr("0 > True"), false);
      assert.strictEqual(evaluateExpr("0 < True"), true);
      assert.strictEqual(evaluateExpr("1 <= True"), true);

      assert.strictEqual(evaluateExpr('False < ""'), true);
      assert.strictEqual(evaluateExpr('"" > False'), true);
      assert.strictEqual(evaluateExpr('False > ""'), false);

      assert.strictEqual(evaluateExpr('0 < ""'), true);
      assert.strictEqual(evaluateExpr('"" > 0'), true);
      assert.strictEqual(evaluateExpr('0 > ""'), false);

      assert.strictEqual(evaluateExpr("3 < True"), false);
      assert.strictEqual(evaluateExpr("3 > True"), true);

      assert.strictEqual(evaluateExpr("{} > None"), true);
      assert.strictEqual(evaluateExpr("{} < None"), false);

      assert.strictEqual(evaluateExpr("{} > False"), true);
      assert.strictEqual(evaluateExpr("{} < False"), false);

      assert.strictEqual(evaluateExpr("3 < 'foo'"), true);
      assert.strictEqual(evaluateExpr("'foo' < 4444"), false);

      assert.strictEqual(evaluateExpr("{} < []"), true);
    });

    QUnit.module("containment");

    QUnit.test("in tuples", (assert) => {
      assert.strictEqual(evaluateExpr("'bar' in ('foo', 'bar')"), true);
      assert.strictEqual(evaluateExpr("'bar' in ('foo', 'qux')"), false);
      assert.strictEqual(evaluateExpr("1 in (1,2,3,4)"), true);
      assert.strictEqual(evaluateExpr("1 in (2,3,4)"), false);
      assert.strictEqual(evaluateExpr("'url' in ('url',)"), true);
      assert.strictEqual(evaluateExpr("'ur' in ('url',)"), false);
      assert.strictEqual(evaluateExpr("'url' in ('url', 'foo', 'bar')"), true);
    });

    QUnit.test("in strings", (assert) => {
      assert.strictEqual(evaluateExpr("'bar' in 'bar'"), true);
      assert.strictEqual(evaluateExpr("'bar' in 'foobar'"), true);
      assert.strictEqual(evaluateExpr("'bar' in 'fooqux'"), false);
    });

    QUnit.test("in lists", (assert) => {
      assert.strictEqual(evaluateExpr("'bar' in ['foo', 'bar']"), true);
      assert.strictEqual(evaluateExpr("'bar' in ['foo', 'qux']"), false);
      assert.strictEqual(evaluateExpr("3  in [1,2,3]"), true);
      assert.strictEqual(evaluateExpr("None  in [1,'foo',None]"), true);
      assert.strictEqual(evaluateExpr("not a in b", { a: 3, b: [1, 2, 4, 8] }), true);
    });

    QUnit.test("not in", (assert) => {
      assert.strictEqual(evaluateExpr("1  not in (2,3,4)"), true);
      assert.strictEqual(evaluateExpr('"ur" not in ("url",)'), true);
      assert.strictEqual(evaluateExpr("-2 not in (1,2,3)"), true);
      assert.strictEqual(evaluateExpr("-2 not in (1,-2,3)"), false);
    });

    QUnit.module("conversions");

    QUnit.test("to bool", (assert) => {
      assert.strictEqual(evaluateExpr("bool('')"), false);
      assert.strictEqual(evaluateExpr("bool('foo')"), true);
      assert.strictEqual(evaluateExpr("bool(date_deadline)", { date_deadline: "2008" }), true);
      assert.strictEqual(evaluateExpr("bool(s)", { s: "" }), false);
    });

    QUnit.module("callables");

    QUnit.test("should call function from context", (assert) => {
      assert.strictEqual(evaluateExpr("foo()", { foo: () => 3 }), 3);
      assert.strictEqual(evaluateExpr("1 + foo()", { foo: () => 3 }), 4);
    });

    QUnit.module("dicts");

    QUnit.test("dict", (assert) => {
      assert.deepEqual(evaluateExpr("{}"), {});
      assert.deepEqual(evaluateExpr("{'foo': 1 + 2}"), { foo: 3 });
      assert.deepEqual(evaluateExpr("{'foo': 1, 'bar': 4}"), { foo: 1, bar: 4 });
    });

    QUnit.test("lookup and definition", (assert) => {
      assert.strictEqual(evaluateExpr("{'a': 1}['a']"), 1);
      assert.strictEqual(evaluateExpr("{1: 2}[1]"), 2);
    });

    QUnit.test("can get values with get method", (assert) => {
      assert.strictEqual(evaluateExpr("{'a': 1}.get('a')"), 1);
      assert.strictEqual(evaluateExpr("{'a': 1}.get('b')"), null);
      assert.strictEqual(evaluateExpr("{'a': 1}.get('b', 54)"), 54);
    });

    QUnit.module("objects");

    QUnit.test("can read values from object", (assert) => {
      assert.strictEqual(evaluateExpr("obj.a", { obj: { a: 123 } }), 123);
      assert.strictEqual(evaluateExpr("obj.a.b.c", { obj: { a: { b: { c: 321 } } } }), 321);
    });

    QUnit.test("can call function in object", (assert) => {
      assert.strictEqual(evaluateExpr("obj.f(3)", { obj: { f: (n: any) => n + 1 } }), 4);
    });

    QUnit.module("if expressions");

    QUnit.test("simple if expressions", (assert) => {
      assert.strictEqual(evaluateExpr("1 if True else 2"), 1);
      assert.strictEqual(evaluateExpr("1 if 3 < 2 else 'greater'"), "greater");
    });

    QUnit.test("only evaluate proper branch", (assert) => {
      // will throw if evaluate wrong branch => name error
      assert.strictEqual(evaluateExpr("1 if True else boom"), 1);
      assert.strictEqual(evaluateExpr("boom if False else 222"), 222);
    });
  });
});
