import fs from 'node:fs';
import path from "node:path";

export function executeOnJsFilesInDir(dirPath, operation) {
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
