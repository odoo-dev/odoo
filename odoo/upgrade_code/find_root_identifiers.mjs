#!/usr/bin/env node
/**
 * find_root_identifiers.mjs
 *
 * Identifies root identifiers in JavaScript expressions using OWL's tokenizer.
 * A "root identifier" is a variable that should be looked up on the component
 * (not a property access, object key, arrow param, or reserved word).
 *
 * Protocol: reads JSON array of {expr} from stdin, writes JSON array of
 * {expr, rootIdentifiers: [{name, start, end}]} to stdout.
 */

// --- OWL tokenizer (extracted from owl.js) ---

const RESERVED_WORDS = "true,false,NaN,null,undefined,debugger,console,window,in,instanceof,new,function,return,eval,void,Math,RegExp,Array,Object,Date,__globals__".split(",");

const WORD_REPLACEMENT = Object.assign(Object.create(null), {
    and: "&&",
    or: "||",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
});

const STATIC_TOKEN_MAP = Object.assign(Object.create(null), {
    "{": "LEFT_BRACE",
    "}": "RIGHT_BRACE",
    "[": "LEFT_BRACKET",
    "]": "RIGHT_BRACKET",
    ":": "COLON",
    ",": "COMMA",
    "(": "LEFT_PAREN",
    ")": "RIGHT_PAREN",
});

const OPERATORS = "...,.,===,==,+,!==,!=,!,||,&&,>=,>,<=,<,?,-,*,/,%,typeof ,=>,=,;,in ,new ,|,&,^,~".split(",");

function tokenizeString(expr) {
    let s = expr[0];
    let start = s;
    if (s !== "'" && s !== '"' && s !== "`") {
        return false;
    }
    let i = 1;
    let cur;
    while (expr[i] && expr[i] !== start) {
        cur = expr[i];
        s += cur;
        if (cur === "\\") {
            i++;
            cur = expr[i];
            if (!cur) {
                throw new Error("Invalid expression");
            }
            s += cur;
        } else if (start === "`" && cur === "$" && expr[i + 1] === "{") {
            // Template literal interpolation: consume ${...} including nested braces
            s += expr[i + 1]; // "{"
            i += 2;
            let depth = 1;
            while (i < expr.length && depth > 0) {
                cur = expr[i];
                s += cur;
                if (cur === "{") depth++;
                else if (cur === "}") depth--;
                if (depth > 0) i++;
            }
            // i now points to the closing "}" of the interpolation
        }
        i++;
    }
    if (expr[i] !== start) {
        throw new Error("Invalid expression");
    }
    s += start;
    if (start === "`") {
        return { type: "TEMPLATE_STRING", value: s };
    }
    return { type: "VALUE", value: s };
}

function tokenizeNumber(expr) {
    let s = expr[0];
    if (s && s.match(/[0-9]/)) {
        let i = 1;
        while (expr[i] && expr[i].match(/[0-9]|\./)) {
            s += expr[i];
            i++;
        }
        return { type: "VALUE", value: s };
    }
    return false;
}

function tokenizeSymbol(expr) {
    let s = expr[0];
    if (s && s.match(/[a-zA-Z_$]/)) {
        let i = 1;
        while (expr[i] && expr[i].match(/\w/)) {
            s += expr[i];
            i++;
        }
        if (s in WORD_REPLACEMENT) {
            return { type: "OPERATOR", value: WORD_REPLACEMENT[s], size: s.length };
        }
        return { type: "SYMBOL", value: s };
    }
    return false;
}

function tokenizeStatic(expr) {
    const char = expr[0];
    if (char && char in STATIC_TOKEN_MAP) {
        return { type: STATIC_TOKEN_MAP[char], value: char };
    }
    return false;
}

function tokenizeOperator(expr) {
    for (let op of OPERATORS) {
        if (expr.startsWith(op)) {
            return { type: "OPERATOR", value: op };
        }
    }
    return false;
}

const TOKENIZERS = [
    tokenizeString,
    tokenizeNumber,
    tokenizeOperator,
    tokenizeSymbol,
    tokenizeStatic,
];

/**
 * Tokenize with position tracking. Returns tokens with `start` and `end`
 * positions relative to the original expression string.
 */
function tokenizeWithPositions(expr) {
    const result = [];
    let token = true;
    let current = expr;
    let pos = 0;

    try {
        while (token) {
            // Skip whitespace, tracking position
            const trimmed = current.trimStart();
            pos += current.length - trimmed.length;
            current = trimmed;

            if (current) {
                token = false;
                for (let tokenizer of TOKENIZERS) {
                    token = tokenizer(current);
                    if (token) {
                        const consumeLen = token.size || token.value.length;
                        token.start = pos;
                        token.end = pos + consumeLen;
                        result.push(token);
                        current = current.slice(consumeLen);
                        pos += consumeLen;
                        break;
                    }
                }
            } else {
                token = false;
            }
        }
    } catch (e) {
        // Return empty on tokenizer error
        return null;
    }

    if (current.length) {
        return null; // Couldn't fully tokenize
    }
    return result;
}

// --- Root identifier detection (compileExprToArray logic) ---

const isLeftSeparator = (token) =>
    token && (token.type === "LEFT_BRACE" || token.type === "COMMA");

function findRootIdentifiers(expr) {
    const tokens = tokenizeWithPositions(expr);
    if (!tokens) return [];

    const localVars = new Set();
    const rootIdentifiers = [];
    let stack = [];

    // First pass: detect arrow function parameters
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const nextToken = tokens[i + 1];

        if (nextToken && nextToken.type === "OPERATOR" && nextToken.value === "=>") {
            if (token.type === "RIGHT_PAREN") {
                // (a, b) => ... — walk back to find LEFT_PAREN
                let j = i - 1;
                while (j >= 0 && tokens[j].type !== "LEFT_PAREN") {
                    if (tokens[j].type === "SYMBOL") {
                        localVars.add(tokens[j].value);
                    }
                    j--;
                }
            } else if (token.type === "SYMBOL") {
                localVars.add(token.value);
            }
        }
    }

    // Second pass: identify root identifiers
    stack = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const prevToken = tokens[i - 1];
        const nextToken = tokens[i + 1];
        const groupType = stack[stack.length - 1];

        switch (token.type) {
            case "LEFT_BRACE":
            case "LEFT_BRACKET":
            case "LEFT_PAREN":
                stack.push(token.type);
                break;
            case "RIGHT_BRACE":
            case "RIGHT_BRACKET":
            case "RIGHT_PAREN":
                stack.pop();
                break;
        }

        // Recurse into template literal interpolations
        if (token.type === "TEMPLATE_STRING") {
            const tpl = token.value;
            const tplStart = token.start;
            // Find ${...} blocks and recursively find root identifiers
            let j = 1; // skip opening backtick
            while (j < tpl.length - 1) {
                if (tpl[j] === "\\" && j + 1 < tpl.length) {
                    j += 2;
                    continue;
                }
                if (tpl[j] === "$" && tpl[j + 1] === "{") {
                    j += 2; // skip "${"
                    let depth = 1;
                    let exprStart = j;
                    while (j < tpl.length && depth > 0) {
                        if (tpl[j] === "{") depth++;
                        else if (tpl[j] === "}") depth--;
                        if (depth > 0) j++;
                    }
                    // tpl[exprStart..j) is the interpolated expression
                    const innerExpr = tpl.slice(exprStart, j);
                    const innerOffset = tplStart + exprStart;
                    const innerIds = findRootIdentifiers(innerExpr);
                    for (const id of innerIds) {
                        rootIdentifiers.push({
                            name: id.name,
                            start: id.start + innerOffset,
                            end: id.end + innerOffset,
                        });
                    }
                    j++; // skip closing "}"
                    continue;
                }
                j++;
            }
            continue;
        }

        if (token.type !== "SYMBOL") continue;
        if (RESERVED_WORDS.includes(token.value)) continue;
        if (localVars.has(token.value)) continue;

        let isVar = true;

        if (prevToken) {
            // Property access: a.b — b is not a root identifier
            if (prevToken.type === "OPERATOR" && prevToken.value === ".") {
                isVar = false;
            }
            // Object key: {key: value} or {key} — handle shorthand
            else if (prevToken.type === "LEFT_BRACE" || prevToken.type === "COMMA") {
                // Check for shorthand: {a} should be treated as {a: a}
                // In shorthand, the symbol IS a root identifier (it's both key and value)
                const isRightSep = nextToken &&
                    (nextToken.type === "RIGHT_BRACE" || nextToken.type === "COMMA");

                if (groupType === "LEFT_BRACE" && isRightSep) {
                    // Shorthand {a} — this IS a root identifier (the value part)
                    isVar = true;
                } else if (nextToken && nextToken.type === "COLON") {
                    // Regular object key {a: b} — a is NOT a root identifier
                    isVar = false;
                }
            }
        }

        if (isVar) {
            rootIdentifiers.push({
                name: token.value,
                start: token.start,
                end: token.end,
            });
        }
    }

    return rootIdentifiers;
}

// --- Batch JSON interface ---

function main() {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
        try {
            const requests = JSON.parse(input);
            const results = requests.map(({ expr }) => {
                try {
                    return { expr, rootIdentifiers: findRootIdentifiers(expr) };
                } catch (e) {
                    return { expr, rootIdentifiers: [] };
                }
            });
            process.stdout.write(JSON.stringify(results));
        } catch (e) {
            process.stderr.write("Error: " + e.message + "\n");
            process.exit(1);
        }
    });
}

main();
