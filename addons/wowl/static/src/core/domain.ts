import { evaluate, formatAST, parseExpr } from "../py/index";
import { AST, AST_TYPE } from "../py/parser";
import { toPyValue } from "../py/utils";

type Record = { [field: string]: any };

type Condition = [string, string, any];

export type DomainListRepr = ("&" | "|" | "!" | Condition)[];
type DomainStringRepr = string;
type DomainClassRepr = Domain;

export type DomainRepr = DomainListRepr | DomainStringRepr | DomainClassRepr;

export class Domain {
  ast: AST;

  constructor(descr: DomainRepr) {
    if (descr instanceof Domain) {
      this.ast = descr.ast;
    } else {
      const rawAST = typeof descr === "string" ? parseExpr(descr) : toAST(descr);
      this.ast = normalizeDomainAST(rawAST);
    }
  }

  contains(record: Record): boolean {
    const expr = evaluate(this.ast, record);
    return matchDomain(record, expr);
  }

  toString(): string {
    return formatAST(this.ast!);
  }

  toList(context?: any): DomainListRepr {
    return evaluate(this.ast, context);
  }
}

export function combineDomains(domains: DomainRepr[], operator: "AND" | "OR"): Domain {
  if (domains.length === 0) {
    return new Domain([]);
  }
  const domain1 = domains[0] instanceof Domain ? domains[0] : new Domain(domains[0]);
  if (domains.length === 1) {
    return domain1;
  }
  const domain2 = combineDomains(domains.slice(1), operator);
  const result = new Domain([]);
  const astValues1 = (domain1.ast as any).value;
  const astValues2 = (domain2.ast as any).value;
  const op = operator === "AND" ? "&" : "|";
  const combinedAST: AST = { type: AST_TYPE.List, value: astValues1.concat(astValues2) };
  result.ast = normalizeDomainAST(combinedAST, op);
  return result;
}

function toAST(domain: DomainListRepr): AST {
  const elems: AST[] = domain.map((elem) => {
    switch (elem) {
      case "!":
      case "&":
      case "|":
        return { type: AST_TYPE.String, value: elem };
      default:
        return {
          type: AST_TYPE.Tuple,
          value: elem.map(toPyValue),
        };
    }
  });
  return { type: AST_TYPE.List, value: elems };
}

function normalizeDomainAST(domain: AST, op: "&" | "|" = "&"): AST {
  if (domain.type !== AST_TYPE.List) {
    throw new Error("Invalid domain AST");
  }
  let expected = -1;
  for (let child of domain.value) {
    if (child.type === AST_TYPE.String && (child.value === "&" || child.value === "|")) {
      expected--;
    } else if (child.type !== AST_TYPE.String || child.value !== "!") {
      expected++;
    }
  }
  let values = domain.value.slice();
  while (expected > 0) {
    expected--;
    values.unshift({ type: AST_TYPE.String, value: op });
  }
  return { type: AST_TYPE.List, value: values };
}

function matchDomain(record: Record, domain: DomainListRepr): boolean {
  if (domain.length === 0) {
    return true;
  }
  switch (domain[0]) {
    case "!":
      return !matchDomain(record, domain.slice(1));
    case "&":
      return matchDomain(record, domain.slice(1, 2)) && matchDomain(record, domain.slice(2));
    case "|":
      return matchDomain(record, domain.slice(1, 2)) || matchDomain(record, domain.slice(2));
    default:
      const condition = domain[0];
      const field = condition[0];
      const fieldValue = record[field];
      const value = condition[2];
      switch (condition[1]) {
        case "=":
        case "==":
          return fieldValue === value;
        case "!=":
        case "<>":
          return fieldValue !== value;
        case "<":
          return fieldValue < value;
        case "<=":
          return fieldValue <= value;
        case ">":
          return fieldValue > value;
        case ">=":
          return fieldValue >= value;
        case "in":
          return value.includes(fieldValue);
        case "not in":
          return !value.includes(fieldValue);
        case "like":
          return fieldValue.toLowerCase().indexOf(value.toLowerCase()) >= 0;
        case "=like":
          const regExp = new RegExp(
            value
              .toLowerCase()
              .replace(/([.\[\]\{\}\+\*])/g, "\\$1")
              .replace(/%/g, ".*")
          );
          return regExp.test(fieldValue.toLowerCase());
        case "ilike":
          return fieldValue.indexOf(value) >= 0;
        case "=ilike":
          return new RegExp(value.replace(/%/g, ".*"), "i").test(fieldValue);
      }
  }
  throw new Error("could not match domain");
}
