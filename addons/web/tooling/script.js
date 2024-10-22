#!/usr/bin/env node

const fs = require("node:fs");
const parser = require("@babel/parser");
const babelGenerator = require("@babel/generator");
// const babel = require("@babel/core");
const { operation } = require("./operation");
const { executeOnJsFilesInDir } = require("./executeOnJsFilesInDir");

const generate = babelGenerator.default;

const { parseArgs } = require("node:util");

const sep =
    "\n=========================================================================================================\n";

const { values } = parseArgs({
    options: {
        "addons-path": { type: "string", default: "../../.." },
        // glob: { type: "string" },
        write: { type: "boolean", default: false },
    },
});

const directoriesToProcess = values["addons-path"].split(",");

const operations = [operation, operation]; // could be filtered with some arg

function makeGetAST() {
    const cacheAST = {};
    return {
        cacheAST,
        getAST(filePath) {
            // normalize path (absolute)
            if (!cacheAST[filePath]) {
                const fileContent = fs.readFileSync(filePath, "utf-8");
                const ast = parser.parse(fileContent, { ecmaVersion: 2022, sourceType: "module" });
                cacheAST[filePath] = ast;
            }
            return cacheAST[filePath];
        },
    };
}

const { cacheAST, getAST } = makeGetAST();

for (const operation of operations) {
    for (const path of directoriesToProcess) {
        executeOnJsFilesInDir(path, (filePath) => operation(filePath, { getAST }));
    }
}

let count = 1;
for (const filePath in cacheAST) {
    console.log(sep, `(${count}) `, filePath, sep);
    count++;
    const ast = cacheAST[filePath];
    const result = generate(ast);
    console.log(result.code);
    if (values.write) {
        // should write on file
    }
}

// const result = babel.transformSync(data, {
//     plugins: [() => ({ visitor })],
// });
