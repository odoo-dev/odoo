import fs from "node:fs";
import { parseArgs } from "node:util";

import generator from "@babel/generator";
import parser from "@babel/parser";

import { executeOnJsFilesInDir } from "./execute_on_js_files_in_dir";
import { operation } from "./operation";

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
                const ast = parser.parse(fileContent, { sourceType: "module" });
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
    const result = generator(ast);
    console.log(result.code);
    if (values.write) {
        // should write on file
    }
}
