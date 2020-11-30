import { evaluateExpr } from "../py/index";

export interface Context {
  [key: string]: any;
}

type ContextDescription = Context | string | undefined;

export function makeContext(...contexts: ContextDescription[]): Context {
  let context = {};
  for (let ctx of contexts) {
    const subCtx = typeof ctx === "string" ? evaluateExpr(ctx, context) : ctx;
    Object.assign(context, subCtx);
  }
  return context;
}
