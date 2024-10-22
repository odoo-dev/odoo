const fs = require("node:fs");
const path = require("node:path");

function executeOnJsFilesInDir(dirPath, operation) {
    const fsDir = fs.opendirSync(dirPath);
    let fsDirent;
    while ((fsDirent = fsDir.readSync())) {
        const direntPath = path.join(dirPath, fsDirent.name);
        if (fsDirent.isFile() && path.extname(fsDirent.name) === ".js") {
            operation(direntPath);
        } else if (fsDirent.isDirectory()) {
            executeOnJsFilesInDir(direntPath, operation);
        }
    }
    fsDir.closeSync();
}

exports.executeOnJsFilesInDir = executeOnJsFilesInDir;
