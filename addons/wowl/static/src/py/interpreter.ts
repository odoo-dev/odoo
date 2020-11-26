import { BUILTINS, PyDate, parseArgs, PyDateTime, PyTime, PyRelativeDelta } from "./builtins";
import { AST, ASTBinaryOperator, ASTUnaryOperator, AST_TYPE } from "./parser";

export type EvalContext = { [key: string]: any };

const isTrue = BUILTINS.bool;

function applyUnaryOp(ast: ASTUnaryOperator, context: EvalContext): any {
  const expr = evaluate(ast.right, context);
  switch (ast.op) {
    case "-":
      return -expr;
    case "+":
      return expr;
    case "not":
      return !isTrue(expr);
  }
  throw new Error("error");
}

// None < number (boolean) < dict < string < list < dict
function pytypeIndex(val: any): number {
  switch (typeof val) {
    case "object":
      // None, List, Object, Dict
      return val === null ? 1 : Array.isArray(val) ? 5 : 3;
    case "number":
      return 2;
    case "string":
      return 4;
  }
  throw new Error("hmmm");
}
function isLess(left: any, right: any): boolean {
  if (typeof left === "number" && typeof right === "number") {
    return left < right;
  }
  if (typeof left === "boolean") {
    left = left ? 1 : 0;
  }
  if (typeof right === "boolean") {
    right = right ? 1 : 0;
  }
  const leftIndex = pytypeIndex(left);
  const rightIndex = pytypeIndex(right);
  if (leftIndex === rightIndex) {
    return left < right;
  }
  return leftIndex < rightIndex;
}

function isEqual(left: any, right: any): boolean {
  if (typeof left !== typeof right) {
    if (typeof left === "boolean" && typeof right === "number") {
      return right === (left ? 1 : 0);
    }
    if (typeof left === "number" && typeof right === "boolean") {
      return left === (right ? 1 : 0);
    }
    return false;
  }
  return left === right;
}

function isIn(left: any, right: any): boolean {
  if (Array.isArray(right)) {
    return right.includes(left);
  }
  if (typeof right === "string" && typeof left === "string") {
    return right.includes(left);
  }
  return false;
}

function applyBinaryOp(ast: ASTBinaryOperator, context: EvalContext): any {
  const left = evaluate(ast.left, context);
  const right = evaluate(ast.right, context);
  switch (ast.op) {
    case "+":
      const isLeftDelta = left instanceof PyRelativeDelta;
      const isRightDelta = right instanceof PyRelativeDelta;
      if (isLeftDelta || isRightDelta) {
        const date = isLeftDelta ? right : left;
        const delta = isLeftDelta ? left : right;
        return PyRelativeDelta.add(date, delta);
      }
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
    case "%":
      return left % right;
    case "//":
      return Math.floor(left / right);
    case "**":
      return left ** right;
    case "==":
      return isEqual(left, right);
    case "<>":
    case "!=":
      return !isEqual(left, right);
    case "<":
      return isLess(left, right);
    case ">":
      return isLess(right, left);
    case ">=":
      return isEqual(left, right) || isLess(right, left);
    case "<=":
      return isEqual(left, right) || isLess(left, right);
    case "in":
      return isIn(left, right);
    case "not in":
      return !isIn(left, right);
  }
  throw new Error("error");
}

// interface Dict {
//   get(key: string, defValue?: any): any;
// }

const DICT: any = {
  get(dict: any) {
    return (...args: any[]) => {
      const { key, defValue } = parseArgs(args, ["key", "defValue"]);
      if (key in dict) {
        return dict[key];
      } else if (defValue) {
        return defValue;
      }
      return null;
    };
  },
};

export function evaluate(ast: AST, context: EvalContext = {}): any {
  const dicts = new Set<any>();

  function _evaluate(ast: AST): any {
    switch (ast.type) {
      case AST_TYPE.Number:
      case AST_TYPE.String:
        return ast.value;
      case AST_TYPE.Name:
        if (ast.value in context) {
          return context[ast.value];
        } else if (ast.value in BUILTINS) {
          return BUILTINS[ast.value];
        } else {
          throw new Error(`Name '${ast.value}' is not defined`);
        }
      case AST_TYPE.None:
        return null;
      case AST_TYPE.Boolean:
        return ast.value;
      case AST_TYPE.UnaryOperator:
        return applyUnaryOp(ast, context);
      case AST_TYPE.BinaryOperator:
        return applyBinaryOp(ast, context);
      case AST_TYPE.BooleanOperator:
        const left = _evaluate(ast.left);
        if (ast.op === "and") {
          return isTrue(left) ? _evaluate(ast.right) : left;
        } else {
          return isTrue(left) ? left : _evaluate(ast.right);
        }
      case AST_TYPE.List:
      case AST_TYPE.Tuple:
        return ast.value.map(_evaluate);
      case AST_TYPE.Dictionary:
        const dict: { [key: string]: any } = {};
        for (let key in ast.value) {
          dict[key] = _evaluate(ast.value[key]);
        }
        dicts.add(dict);
        return dict;
      case AST_TYPE.FunctionCall:
        const fnValue = _evaluate(ast.fn);
        const args = ast.args.map(_evaluate);
        const kwargs: any = {};
        for (let kwarg in ast.kwargs) {
          kwargs[kwarg] = _evaluate(ast.kwargs[kwarg]);
        }
        if (
          fnValue === PyDate ||
          fnValue === PyDateTime ||
          fnValue === PyTime ||
          fnValue === PyRelativeDelta
        ) {
          return fnValue.create(...args, kwargs);
        }
        return fnValue(...args, kwargs);
      case AST_TYPE.Lookup: {
        const dict = _evaluate(ast.target);
        const key = _evaluate(ast.key);
        return dict[key];
      }
      case AST_TYPE.If: {
        if (isTrue(_evaluate(ast.condition))) {
          return _evaluate(ast.ifTrue);
        } else {
          return _evaluate(ast.ifFalse);
        }
      }
      case AST_TYPE.ObjLookup: {
        const left = _evaluate(ast.obj);
        if (dicts.has(left)) {
          // this is a dictionary => need to apply dict methods
          return DICT[ast.key](left);
        }
        if (left instanceof Date) {
          const result = (left as any)[ast.key];
          return typeof result === "function" ? result.bind(left) : result;
        }
        return left[ast.key];
      }
    }
    throw new Error("evaluate error");
  }

  return _evaluate(ast);
}
