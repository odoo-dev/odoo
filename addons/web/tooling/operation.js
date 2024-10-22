const t = require("@babel/types");
const babelTraverse = require("@babel/traverse");
const traverse = babelTraverse.default;

// for ast descriptions see https://github.com/babel/babel/blob/master/packages/babel-parser/ast/spec.md

function isImportOfRegistry(node) {
    return (
        t.isImportDeclaration(node) &&
        node.source.value.endsWith("registry") &&
        node.specifiers &&
        node.specifiers.some((subNode) => {
            return subNode.imported?.name === "registry";
        })
    );
}

function isRegistry(node, name) {
    return (
        t.isCallExpression(node) &&
        t.isMemberExpression(node.callee) &&
        t.isIdentifier(node.callee.object, { name: "registry" }) &&
        t.isIdentifier(node.callee.property, { name: "category" }) &&
        node.arguments.length === 1 &&
        t.isStringLiteral(node.arguments[0], { value: name })
    );
}

function isAdding(node) {
    return (
        t.isCallExpression(node) &&
        t.isMemberExpression(node.callee) &&
        t.isIdentifier(node.callee.property, { name: "add" }) &&
        node.arguments.length >= 2
    );
}

function getClassPropertyForProps(path) {
    if (t.isArrowFunctionExpression(path.node.value) || t.isFunctionExpression(path.node.value)) {
        // remove view param
        const params = [...path.node.value.params];
        params.splice(1, 1);

        // change view in this in body
        const bodyPath = path.get("value.body");
        bodyPath.traverse({
            Identifier(path) {
                if (path.node.name === "view") {
                    path.replaceWith(t.thisExpression());
                }
            },
        });

        return t.classMethod("method", t.identifier("getComponentProps"), params, bodyPath.node);
    }
    if (t.isObjectMethod(path.node)) {
        // remove view param
        const params = [...path.node.params];
        params.splice(1, 1);

        // change view in this in body
        const bodyPath = path.get("body");
        bodyPath.traverse({
            Identifier(path) {
                if (path.node.name === "view") {
                    path.replaceWith(t.thisExpression());
                }
            },
        });

        return t.classMethod("method", t.identifier("getComponentProps"), params, bodyPath.node);
    }
}

function toViewClass(path) {
    t.assertObjectExpression(path.node);

    const classProperties = [];
    for (const p of path.get("properties")) {
        if (p.isObjectProperty()) {
            if (t.isIdentifier(p.node.key, { name: "type" })) {
                continue;
            }
            if (t.isIdentifier(p.node.key, { name: "Controller" })) {
                classProperties.push(t.classProperty(t.identifier("Component"), p.node.value));
            }
            if (t.isIdentifier(p.node.key, { name: "props" })) {
                classProperties.push(getClassPropertyForProps(p));
                continue;
            }
            classProperties.push(t.classProperty(p.node.key, p.node.value));
        } else if (p.isObjectMethod() && t.isIdentifier(p.node.key, { name: "props" })) {
            classProperties.push(getClassPropertyForProps(p));
            continue;
        } else if (p.isSpreadElement()) {
            // todo
            continue;
        }
    }

    return t.classDeclaration(
        t.identifier("PivotViewDescription"),
        null,
        t.classBody(classProperties)
    );
}

const visitor = {
    Program(path) {
        if (!path.node.body.some((n) => isImportOfRegistry(n))) {
            // what about patches?
            path.stop();
        }
        // what if imported registry is not what we expect?
    },
    // VariableDeclarator(path) {
    //     if (
    //         t.isIdentifier(path.node.id, { name: "pivotView" }) &&
    //         t.isObjectExpression(path.node.init)
    //     ) {
    //         // name should be detected by looking at what is added in registry.category('views')
    //         const classDeclaration = toViewClass(path.get("init"));
    //         path.parentPath.replaceWith(classDeclaration);
    //         path.skip();
    //     }
    // },
    CallExpression(path) {
        // if (isRegistry(path.node, "views")) {
        //     return;
        // }
        if (isAdding(path.node)) {
            if (
                isRegistry(path.node.callee.object, "views") ||
                (t.isIdentifier(path.node.callee.object) &&
                    isRegistry(
                        path.scope.bindings[path.node.callee.object.name].path.node.init,
                        "views"
                    ))
            ) {
                const pathAdded = path.get("arguments.1");
                const targetPath = pathAdded.isIdentifier()
                    ? pathAdded.scope.bindings[pathAdded.node.name].path.get("init")
                    : pathAdded;
                targetPath.assertObjectExpression();
                const classDeclaration = toViewClass(targetPath);
                targetPath.parentPath.replaceWith(classDeclaration);
                if (pathAdded.isIdentifier()) {
                    pathAdded.node.name = classDeclaration.id?.name;
                }
                path.skip();
            }
        }
    },
};

function operation(filePath, { getAST }) {
    const ast = getAST(filePath);
    traverse(ast, visitor);
}

exports.operation = operation;
