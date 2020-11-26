// -----------------------------------------------------------------------------
// Tokenizer
// -----------------------------------------------------------------------------

export const enum TOKEN_TYPE {
  Number,
  String,
  Symbol,
  Name,
  Constant,
}

interface TokenNumber {
  type: TOKEN_TYPE.Number;
  value: number;
}

interface TokenString {
  type: TOKEN_TYPE.String;
  value: string;
}

export interface TokenSymbol {
  type: TOKEN_TYPE.Symbol;
  value: string;
}

interface TokenName {
  type: TOKEN_TYPE.Name;
  value: string;
}

interface TokenConstant {
  type: TOKEN_TYPE.Constant;
  value: string;
}

export type Token = TokenNumber | TokenString | TokenSymbol | TokenName | TokenConstant;

const constants = new Set(["None", "False", "True"]);
export const comparators = [
  "in",
  "not",
  "not in",
  "is",
  "is not",
  "<",
  "<=",
  ">",
  ">=",
  "<>",
  "!=",
  "==",
];
export const binaryOperators = [
  "or",
  "and",
  "|",
  "^",
  "&",
  "<<",
  ">>",
  "+",
  "-",
  "*",
  "/",
  "//",
  "%",
  "~",
  "**",
  ".",
];
export const unaryOperators = ["-"];

const symbols = new Set([
  ...["(", ")", "[", "]", "{", "}", ":", ","],
  ...["if", "else", "lambda", "="],
  ...comparators,
  ...binaryOperators,
  ...unaryOperators,
]);

// Regexps
function group(...args: string[]) {
  return "(" + args.join("|") + ")";
}

const Name = "[a-zA-Z_]\\w*";
const Whitespace = "[ \\f\\t]*";

const DecNumber = "\\d+(L|l)?";
const IntNumber = DecNumber;
const PointFloat = group("\\d+\\.\\d*", "\\.\\d+");
const FloatNumber = PointFloat;
const Number = group(FloatNumber, IntNumber);

const Operator = group("\\*\\*=?", ">>=?", "<<=?", "<>", "!=", "//=?", "[+\\-*/%&|^=<>]=?", "~");
const Bracket = "[\\[\\]\\(\\)\\{\\}]";
const Special = "[:;.,`@]";
const Funny = group(Operator, Bracket, Special);

const ContStr = group(
  "([uU])?'([^\n'\\\\]*(?:\\\\.[^\n'\\\\]*)*)'",
  '([uU])?"([^\n"\\\\]*(?:\\\\.[^\n"\\\\]*)*)"'
);
const PseudoToken = Whitespace + group(Number, Funny, ContStr, Name);

const NumberPattern = new RegExp("^" + Number + "$");
const StringPattern = new RegExp("^" + ContStr + "$");
const NamePattern = new RegExp("^" + Name + "$");
const strip = new RegExp("^" + Whitespace);

export function tokenize(str: string): Token[] {
  const tokens: Token[] = [];
  let max = str.length;
  let start: number = 0;
  let end: number = 0;

  // /g flag makes repeated exec() have memory
  const pseudoprog = new RegExp(PseudoToken, "g");
  while (pseudoprog.lastIndex < max) {
    const pseudomatch = pseudoprog.exec(str);
    if (!pseudomatch) {
      // if match failed on trailing whitespace, end tokenizing
      if (/^\s+$/.test(str.slice(end))) {
        break;
      }
      throw new Error(
        "Failed to tokenize <<" + str + ">> at index " + (end || 0) + "; parsed so far: " + tokens
      );
    }
    if (pseudomatch.index > end) {
      if (str.slice(end, pseudomatch.index).trim()) {
        throw new Error("Tokenizer error: Invalid expression");
      }
    }
    start = pseudomatch.index;
    end = pseudoprog.lastIndex;
    let token = str.slice(start, end).replace(strip, "");
    if (NumberPattern.test(token)) {
      tokens.push({
        type: TOKEN_TYPE.Number,
        value: parseFloat(token),
      });
    } else if (StringPattern.test(token)) {
      var m = StringPattern.exec(token)!;
      tokens.push({
        type: TOKEN_TYPE.String,
        value: decodeStringLiteral(m[3] !== undefined ? m[3] : m[5], !!(m[2] || m[4])),
      });
    } else if (symbols.has(token)) {
      // transform 'not in' and 'is not' in a single token
      if (token === "in" && tokens.length > 0 && tokens[tokens.length - 1].value === "not") {
        token = "not in";
        tokens.pop();
      } else if (token === "not" && tokens.length > 0 && tokens[tokens.length - 1].value === "is") {
        token = "is not";
        tokens.pop();
      }

      tokens.push({
        type: TOKEN_TYPE.Symbol,
        value: token,
      });
    } else if (constants.has(token)) {
      tokens.push({
        type: TOKEN_TYPE.Constant,
        value: token,
      });
    } else if (NamePattern.test(token)) {
      tokens.push({
        type: TOKEN_TYPE.Name,
        value: token,
      });
    } else {
      throw new Error("aaaaa");
    }
  }
  return tokens;
}

// Directly maps a single escape code to an output
// character
const directMap: { [key: string]: string } = {
  "\\": "\\",
  '"': '"',
  "'": "'",
  a: "\x07",
  b: "\x08",
  f: "\x0c",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
};

/**
 * Implements the decoding of Python string literals (embedded in
 * JS strings) into actual JS strings. This includes the decoding
 * of escapes into their corresponding JS
 * characters/codepoints/whatever.
 *
 * The ``unicode`` flags notes whether the literal should be
 * decoded as a bytestring literal or a unicode literal, which
 * pretty much only impacts decoding (or not) of unicode escapes
 * at this point since bytestrings are not technically handled
 * (everything is decoded to JS "unicode" strings)
 *
 * Eventurally, ``str`` could eventually use typed arrays, that'd
 * be interesting...
 */
function decodeStringLiteral(str: string, unicode: boolean): string {
  var out = [],
    code;

  for (var i = 0; i < str.length; ++i) {
    if (str[i] !== "\\") {
      out.push(str[i]);
      continue;
    }
    var escape = str[i + 1];
    if (escape in directMap) {
      out.push(directMap[escape]);
      ++i;
      continue;
    }

    switch (escape) {
      // Ignored
      case "\n":
        ++i;
        continue;
      // Character named name in the Unicode database (Unicode only)
      case "N":
        if (!unicode) {
          break;
        }
        throw Error("SyntaxError: \\N{} escape not implemented");
      case "u":
        if (!unicode) {
          break;
        }
        var uni = str.slice(i + 2, i + 6);
        if (!/[0-9a-f]{4}/i.test(uni)) {
          throw new Error(
            [
              "SyntaxError: (unicode error) 'unicodeescape' codec",
              " can't decode bytes in position ",
              i,
              "-",
              i + 4,
              ": truncated \\uXXXX escape",
            ].join("")
          );
        }
        code = parseInt(uni, 16);
        out.push(String.fromCharCode(code));
        // escape + 4 hex digits
        i += 5;
        continue;
      case "U":
        if (!unicode) {
          break;
        }
        // TODO: String.fromCodePoint
        throw Error("SyntaxError: \\U escape not implemented");
      case "x":
        // get 2 hex digits
        var hex = str.slice(i + 2, i + 4);
        if (!/[0-9a-f]{2}/i.test(hex)) {
          if (!unicode) {
            throw new Error("ValueError: invalid \\x escape");
          }
          throw new Error(
            [
              "SyntaxError: (unicode error) 'unicodeescape'",
              " codec can't decode bytes in position ",
              i,
              "-",
              i + 2,
              ": truncated \\xXX escape",
            ].join("")
          );
        }
        code = parseInt(hex, 16);
        out.push(String.fromCharCode(code));
        // skip escape + 2 hex digits
        i += 3;
        continue;
      default:
        // Check if octal
        if (!/[0-8]/.test(escape)) {
          break;
        }
        var r = /[0-8]{1,3}/g;
        r.lastIndex = i + 1;
        var m = r.exec(str)!;
        var oct = m[0];
        code = parseInt(oct, 8);
        out.push(String.fromCharCode(code));
        // skip matchlength
        i += oct.length;
        continue;
    }
    out.push("\\");
  }

  return out.join("");
}
