import { Context } from "../types";
import { evaluateExpr } from "./py/index";

type ContextDescription = Context | string | undefined;

export function makeContext(...contexts: ContextDescription[]): Context {
  let context = {};
  for (let ctx of contexts) {
    const subCtx = typeof ctx === "string" ? evaluateExpr(ctx, context) : ctx;
    Object.assign(context, subCtx);
  }
  return context;
}
