import { tokenize } from "./tokenizer";
import { parse, AST } from "./parser";
import { evaluate, EvalContext } from "./interpreter";

export { tokenize, TOKEN_TYPE } from "./tokenizer";
export { parse, AST_TYPE } from "./parser";
export { evaluate } from "./interpreter";

export function parseExpr(expr: string): AST {
  const tokens = tokenize(expr);
  return parse(tokens);
}

export function evaluateExpr(expr: string, context?: EvalContext): any {
  const ast = parseExpr(expr);
  return evaluate(ast, context);
}
