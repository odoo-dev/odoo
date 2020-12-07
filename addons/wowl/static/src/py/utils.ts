import { AST, AST_TYPE, bp } from "./parser";

export function toPyValue(value: any): AST {
  switch (typeof value) {
    case "string":
      return { type: AST_TYPE.String, value };
    case "number":
      return { type: AST_TYPE.Number, value };
    case "boolean":
      return { type: AST_TYPE.Boolean, value };
    case "object":
      if (Array.isArray(value)) {
        return { type: AST_TYPE.List, value: value.map(toPyValue) };
      } else {
        const content: { [key: string]: AST } = {};
        for (let key in value) {
          content[key] = toPyValue(value[key]);
        }
        return { type: AST_TYPE.Dictionary, value: content };
      }
    default:
      throw new Error("Invalid type");
  }
}

export function formatAST(ast: AST, lbp: number = 0): string {
  switch (ast.type) {
    case AST_TYPE.None:
      return "None";
    case AST_TYPE.String:
      return JSON.stringify(ast.value);
    case AST_TYPE.Number:
      return String(ast.value);
    case AST_TYPE.Boolean:
      return ast.value ? "True" : "False";
    case AST_TYPE.List:
      return `[${ast.value.map(formatAST).join(", ")}]`;
    case AST_TYPE.UnaryOperator:
      if (ast.op === "not") {
        return `not ` + formatAST(ast.right, 50);
      }
      return ast.op + formatAST(ast.right, 130);
    case AST_TYPE.BinaryOperator: {
      const abp = bp(ast.op);
      const str = `${formatAST(ast.left, abp)} ${ast.op} ${formatAST(ast.right, abp)}`;
      return abp < lbp ? `(${str})` : str;
    }
    case AST_TYPE.Dictionary: {
      const pairs: string[] = [];
      for (let k in ast.value) {
        pairs.push(`"${k}": ${formatAST(ast.value[k])}`);
      }
      return `{` + pairs.join(", ") + `}`;
    }
    case AST_TYPE.Tuple:
      return `(${ast.value.map(formatAST).join(", ")})`;
    case AST_TYPE.Name:
      return ast.value;
    case AST_TYPE.Lookup: {
      return `${formatAST(ast.target)}[${formatAST(ast.key)}]`;
    }
    case AST_TYPE.If: {
      const { ifTrue, condition, ifFalse } = ast;
      return `${formatAST(ifTrue)} if ${formatAST(condition)} else ${formatAST(ifFalse)}`;
    }
    case AST_TYPE.BooleanOperator: {
      const abp = bp(ast.op);
      const str = `${formatAST(ast.left, abp)} ${ast.op} ${formatAST(ast.right, abp)}`;
      return abp < lbp ? `(${str})` : str;
    }
    case AST_TYPE.ObjLookup:
      return `${formatAST(ast.obj, 150)}.${ast.key}`;
    case AST_TYPE.FunctionCall: {
      const args = ast.args.map(formatAST);
      const kwargs: string[] = [];
      for (let kwarg in ast.kwargs) {
        kwargs.push(`${kwarg} = ${formatAST(ast.kwargs[kwarg])}`);
      }
      const argStr = args.concat(kwargs).join(", ");
      return `${formatAST(ast.fn)}(${argStr})`;
    }
  }
  throw new Error("invalid expression: " + ast);
}

export const PY_DICT = Object.create(null);

export function toPyDict(obj: Object): Object {
  const result = Object.create(PY_DICT);
  return Object.assign(result, obj);
}
