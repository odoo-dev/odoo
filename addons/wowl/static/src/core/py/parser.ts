import { TOKEN_TYPE, Token, binaryOperators, comparators, TokenSymbol } from "./tokenizer";

// -----------------------------------------------------------------------------
// PARSER
// -----------------------------------------------------------------------------

export const enum AST_TYPE {
  Number,
  String,
  Boolean,
  None,
  List,
  Name,
  UnaryOperator,
  BinaryOperator,
  FunctionCall,
  Assignment,
  Tuple,
  Dictionary,
  Lookup,
  If,
  BooleanOperator,
  ObjLookup,
}

interface ASTNumber {
  type: AST_TYPE.Number;
  value: number;
}

interface ASTString {
  type: AST_TYPE.String;
  value: string;
}

interface ASTName {
  type: AST_TYPE.Name;
  value: string;
}

interface ASTBoolean {
  type: AST_TYPE.Boolean;
  value: boolean;
}

interface ASTNone {
  type: AST_TYPE.None;
}

interface ASTList {
  type: AST_TYPE.List;
  value: AST[];
}

interface ASTIf {
  type: AST_TYPE.If;
  condition: AST;
  ifTrue: AST;
  ifFalse: AST;
}

export interface ASTUnaryOperator {
  type: AST_TYPE.UnaryOperator;
  op: string;
  right: AST;
}

export interface ASTBinaryOperator {
  type: AST_TYPE.BinaryOperator;
  op: string;
  left: AST;
  right: AST;
}

interface ASTBooleanOperator {
  type: AST_TYPE.BooleanOperator;
  op: string;
  left: AST;
  right: AST;
}

interface ASTFunctionCall {
  type: AST_TYPE.FunctionCall;
  fn: AST;
  args: AST[];
  kwargs: { [key: string]: AST };
}

interface ASTAssignment {
  type: AST_TYPE.Assignment;
  name: ASTName;
  value: AST;
}

interface ASTTuple {
  type: AST_TYPE.Tuple;
  value: AST[];
}

interface ASTDictionary {
  type: AST_TYPE.Dictionary;
  value: { [key: string]: AST };
}

interface ASTLookup {
  type: AST_TYPE.Lookup;
  target: AST;
  key: AST;
}

interface ASTObjLookup {
  type: AST_TYPE.ObjLookup;
  obj: AST;
  key: string;
}
export type AST =
  | ASTNumber
  | ASTString
  | ASTBoolean
  | ASTNone
  | ASTList
  | ASTBinaryOperator
  | ASTUnaryOperator
  | ASTName
  | ASTFunctionCall
  | ASTAssignment
  | ASTTuple
  | ASTDictionary
  | ASTLookup
  | ASTIf
  | ASTBooleanOperator
  | ASTObjLookup;

const chainedOperators = new Set(comparators);
const infixOperators = new Set(binaryOperators.concat(comparators));

function bindingPower(token: Token): number {
  if (token.type === TOKEN_TYPE.Symbol) {
    switch (token.value) {
      case "=":
        return 10;
      case "if":
        return 20;
      case "in":
      case "not in":
      case "is":
      case "is not":
      case "<":
      case "<=":
      case ">":
      case ">=":
      case "<>":
      case "==":
      case "!=":
        return 60;
      case "or":
        return 30;
      case "and":
        return 40;
      case "not":
        return 50;
      case "|":
        return 70;
      case "^":
        return 80;
      case "&":
        return 90;
      case "<<":
      case ">>":
        return 100;
      case "+":
      case "-":
        return 110;
      case "*":
      case "/":
      case "//":
      case "%":
        return 120;
      case "**":
        return 140;
      case ".":
      case "(":
      case "[":
        return 150;
    }
  }
  return 0;
}

function isSymbol(token: Token, value: string): boolean {
  return token.type === TOKEN_TYPE.Symbol && token.value === value;
}

function parsePrefix(current: Token, tokens: Token[]): AST {
  switch (current.type) {
    case TOKEN_TYPE.Number:
      return { type: AST_TYPE.Number, value: current.value };
    case TOKEN_TYPE.String:
      return { type: AST_TYPE.String, value: current.value };
    case TOKEN_TYPE.Constant:
      if (current.value === "None") {
        return { type: AST_TYPE.None };
      } else {
        return { type: AST_TYPE.Boolean, value: current.value === "True" };
      }
    case TOKEN_TYPE.Name:
      return { type: AST_TYPE.Name, value: current.value };
    case TOKEN_TYPE.Symbol:
      switch (current.value) {
        case "-":
        case "+":
        case "~":
          return { type: AST_TYPE.UnaryOperator, op: current.value, right: _parse(tokens, 130) };
        case "not":
          return { type: AST_TYPE.UnaryOperator, op: current.value, right: _parse(tokens, 50) };
        case "(":
          const content: AST[] = [];
          let isTuple = false;
          while (tokens[0] && !isSymbol(tokens[0], ")")) {
            content.push(_parse(tokens, 0));
            if (tokens[0]) {
              if (tokens[0] && isSymbol(tokens[0], ",")) {
                isTuple = true;
                tokens.shift();
              } else if (!isSymbol(tokens[0], ")")) {
                throw new Error("parsing error");
              }
            } else {
              throw new Error("parsing error");
            }
          }
          if (!tokens[0] || !isSymbol(tokens[0], ")")) {
            throw new Error("parsing error");
          }
          isTuple = isTuple || content.length === 0;
          return isTuple ? { type: AST_TYPE.Tuple, value: content } : content[0];
        case "[":
          const value: AST[] = [];
          while (tokens[0] && !isSymbol(tokens[0], "]")) {
            value.push(_parse(tokens, 0));
            if (tokens[0]) {
              if (isSymbol(tokens[0], ",")) {
                tokens.shift();
              } else if (!isSymbol(tokens[0], "]")) {
                throw new Error("parsing error");
              }
            }
          }
          if (!tokens[0] || !isSymbol(tokens[0], "]")) {
            throw new Error("parsing error");
          }
          tokens.shift();
          return { type: AST_TYPE.List, value };
        case "{": {
          const dict: { [key: string]: AST } = {};
          while (tokens[0] && !isSymbol(tokens[0], "}")) {
            const key = _parse(tokens, 0);
            if (
              (key.type !== AST_TYPE.String && key.type !== AST_TYPE.Number) ||
              !tokens[0] ||
              !isSymbol(tokens[0], ":")
            ) {
              throw new Error("parsing error");
            }
            tokens.shift();
            const value = _parse(tokens, 0);
            dict[key.value] = value;
            if (isSymbol(tokens[0], ",")) {
              tokens.shift();
            }
          }
          // remove the } token
          if (!tokens.shift()) {
            throw new Error("parser error");
          }
          return { type: AST_TYPE.Dictionary, value: dict };
        }
      }
  }
  throw new Error("boom");
}

function parseInfix(left: AST, current: Token, tokens: Token[]): AST {
  switch (current.type) {
    case TOKEN_TYPE.Symbol:
      if (infixOperators.has(current.value)) {
        let right = _parse(tokens, bindingPower(current));
        if (current.value === "and" || current.value === "or") {
          return {
            type: AST_TYPE.BooleanOperator,
            op: current.value,
            left,
            right,
          };
        } else if (current.value === ".") {
          if (right.type === AST_TYPE.Name) {
            return {
              type: AST_TYPE.ObjLookup,
              obj: left,
              key: right.value,
            };
          } else {
            throw new Error("invalid obj lookup");
          }
        }
        let op: AST = {
          type: AST_TYPE.BinaryOperator,
          op: current.value,
          left,
          right,
        };
        while (
          tokens[0] &&
          tokens[0].type === TOKEN_TYPE.Symbol &&
          chainedOperators.has(tokens[0].value)
        ) {
          const nextToken = tokens.shift()! as TokenSymbol;
          op = {
            type: AST_TYPE.BooleanOperator,
            op: "and",
            left: op,
            right: {
              type: AST_TYPE.BinaryOperator,
              op: nextToken.value,
              left: right,
              right: _parse(tokens, bindingPower(nextToken)),
            },
          };
          right = (op.right as any).right;
        }
        return op;
      }
      switch (current.value) {
        case "(":
          // function call
          const args: AST[] = [];
          const kwargs: { [name: string]: AST } = {};

          while (tokens[0] && !isSymbol(tokens[0], ")")) {
            const arg = _parse(tokens, 0);
            if (arg.type === AST_TYPE.Assignment) {
              kwargs[arg.name.value] = arg.value;
            } else {
              args.push(arg);
            }
            if (tokens[0] && isSymbol(tokens[0], ",")) {
              tokens.shift();
            }
          }
          if (!tokens[0] || !isSymbol(tokens[0], ")")) {
            throw new Error("parsing error");
          }
          tokens.shift();

          return { type: AST_TYPE.FunctionCall, fn: left, args, kwargs };
        case "=":
          if (left.type === AST_TYPE.Name) {
            return {
              type: AST_TYPE.Assignment,
              name: left,
              value: _parse(tokens, 10),
            };
          }
        case "[": {
          // lookup in dictionary
          const key = _parse(tokens);
          if (!tokens[0] || !isSymbol(tokens[0], "]")) {
            throw new Error("parsing error");
          }
          tokens.shift();
          return {
            type: AST_TYPE.Lookup,
            target: left,
            key: key,
          };
        }
        case "if": {
          const condition = _parse(tokens);
          if (!tokens[0] || !isSymbol(tokens[0], "else")) {
            throw new Error("parsing error");
          }
          tokens.shift();
          const ifFalse = _parse(tokens);
          return {
            type: AST_TYPE.If,
            condition,
            ifTrue: left,
            ifFalse,
          };
        }
      }
  }
  throw new Error("asfdasdfsdf");
}

function _parse(tokens: Token[], bp: number = 0): AST {
  const token = tokens.shift()!;
  let expr = parsePrefix(token, tokens);
  while (tokens[0] && bindingPower(tokens[0]) > bp) {
    expr = parseInfix(expr, tokens.shift()!, tokens);
  }
  return expr;
}

export function parse(tokens: Token[]): AST {
  return _parse(tokens, 0);
}
