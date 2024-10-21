// const t = require("@babel/types");

// // for ast descriptions see https://github.com/babel/babel/blob/master/packages/babel-parser/ast/spec.md

// function isImportOfRegistry(node) {
//     return (
//         t.isImportDeclaration(node) &&
//         node.source.value.endsWith("registry") &&
//         node.specifiers &&
//         node.specifiers.some((subNode) => subNode.imported.name === "registry")
//     );
// }

// function getClassPropertyForProps(path) {
//     if (t.isArrowFunctionExpression(path.node.value) || t.isFunctionExpression(path.node.value)) {
//         // remove view param
//         const params = [...path.node.value.params];
//         params.splice(1, 1);

//         // change view in this in body
//         const bodyPath = path.get("value.body");
//         bodyPath.traverse({
//             Identifier(path) {
//                 if (path.node.name === "view") {
//                     path.replaceWith(t.thisExpression());
//                 }
//             },
//         });

//         return t.classMethod("method", t.identifier("getComponentProps"), params, bodyPath.node);
//     }
//     if (t.isObjectMethod(path.node)) {
//         // remove view param
//         const params = [...path.node.params];
//         params.splice(1, 1);

//         // change view in this in body
//         const bodyPath = path.get("body");
//         bodyPath.traverse({
//             Identifier(path) {
//                 if (path.node.name === "view") {
//                     path.replaceWith(t.thisExpression());
//                 }
//             },
//         });

//         return t.classMethod("method", t.identifier("getComponentProps"), params, bodyPath.node);
//     }
// }

// function toViewClass(path) {
//     t.assertObjectExpression(path.node);

//     const classProperties = [];
//     for (const p of path.get("properties")) {
//         if (p.isObjectProperty()) {
//             if (t.isIdentifier(p.node.key, { name: "type" })) {
//                 continue;
//             }
//             if (t.isIdentifier(p.node.key, { name: "Controller" })) {
//                 classProperties.push(t.classProperty(t.identifier("Component"), p.node.value));
//             }
//             if (t.isIdentifier(p.node.key, { name: "props" })) {
//                 classProperties.push(getClassPropertyForProps(p));
//                 continue;
//             }
//             classProperties.push(t.classProperty(p.node.key, p.node.value));
//         } else if (p.isObjectMethod() && t.isIdentifier(p.node.key, { name: "props" })) {
//             classProperties.push(getClassPropertyForProps(p));
//             continue;
//         } else if (p.isSpreadElement()) {
//             // todo
//             continue;
//         }
//     }

//     return t.classDeclaration(
//         t.identifier("PivotViewDescription"),
//         null,
//         t.classBody(classProperties)
//     );
// }

// exports.visitor = {
//     Program(path) {
//         if (!path.node.body.some((n) => isImportOfRegistry(n))) {
//             // what about patches?
//             path.stop();
//         }
//         // what if imported registry is not what we expect?
//     },
//     VariableDeclarator(path) {
//         if (
//             t.isIdentifier(path.node.id, { name: "pivotView" }) &&
//             t.isObjectExpression(path.node.init)
//         ) {
//             // name should be detected by looking at what is added in registry.category('views')
//             const classDeclaration = toViewClass(path.get("init"));
//             path.parentPath.replaceWith(classDeclaration);
//             path.skip();
//         }
//     },
// };
