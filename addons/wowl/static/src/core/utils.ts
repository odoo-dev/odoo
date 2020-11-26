import { Context } from "../types";
import { evaluateExpr } from "../py/index";

type ContextDescription = Context | string | undefined;

export function makeContext(...contexts: ContextDescription[]): Context {
  let context = {};
  for (let ctx of contexts) {
    const subCtx = typeof ctx === "string" ? evaluateExpr(ctx, context) : ctx;
    Object.assign(context, subCtx);
  }
  return context;
}

/**
 * Returns a string formatted using given values.
 * If the value is an object, its keys will replace `%(key)s` expressions.
 * If the values are a set of strings, they will replace `%s` expressions.
 * If no value is given, the string will not be formatted.
 */
export function sprintf(s: string, ...values: string[] | [{ [key: string]: string }]): string {
  if (values.length === 1 && typeof values[0] === "object") {
    const valuesDict = values[0] as { [key: string]: string };
    s = s.replace(/\%\(?([^\)]+)\)s/g, (match, value) => valuesDict[value]);
  } else if (values.length > 0) {
    s = s.replace(/\%s/g, () => values.shift() as string);
  }
  return s;
}
