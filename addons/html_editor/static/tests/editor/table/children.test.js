/** @odoo-module */

import { describe, test } from "@odoo/hoot";
import { testEditor } from "../../test_helpers/editor";
import { dispatch } from "@odoo/hoot-dom";

// TODO use the right commands (ADD_ROW, ADD_COLUMN)
function addRow(position) {
    return (editor) => editor.dispatch("ADD_ROW", { position });
}

function addColumn(position) {
    return (editor) => editor.dispatch("ADD_COLUMN", { position });
}

describe("row", () => {
    describe("above", () => {
        test.todo("should add a row above the top row", async () => {
            await testEditor({
                contentBefore:
                    '<table><tbody><tr style="height: 20px;">' +
                    '<td style="width: 20px;">ab</td>' +
                    '<td style="width: 25px;">cd</td>' +
                    '<td style="width: 30px;">ef[]</td>' +
                    "</tr></tbody></table>",
                stepFunction: addRow("before"),
                contentAfter:
                    '<table><tbody><tr style="height: 20px;">' +
                    '<td style="width: 20px;"><p><br></p></td>' +
                    '<td style="width: 25px;"><p><br></p></td>' +
                    '<td style="width: 30px;"><p><br></p></td>' +
                    "</tr>" +
                    '<tr style="height: 20px;">' +
                    "<td>ab</td>" +
                    "<td>cd</td>" +
                    "<td>ef[]</td>" +
                    "</tr></tbody></table>",
            });
        });

        test("should add a row above the middle row", async () => {
            await testEditor({
                contentBefore:
                    '<table><tbody><tr style="height: 20px;">' +
                    '<td style="width: 20px;">ab</td>' +
                    '<td style="width: 25px;">cd</td>' +
                    '<td style="width: 30px;">ef</td>' +
                    "</tr>" +
                    '<tr style="height: 30px;">' +
                    "<td>ab</td>" +
                    "<td>cd</td>" +
                    "<td>ef[]</td>" +
                    "</tr></tbody></table>",
                stepFunction: addRow("before"),
                contentAfter:
                    '<table><tbody><tr style="height: 20px;">' +
                    '<td style="width: 20px;">ab</td>' +
                    '<td style="width: 25px;">cd</td>' +
                    '<td style="width: 30px;">ef</td>' +
                    "</tr>" +
                    '<tr style="height: 30px;">' +
                    "<td><p><br></p></td>" +
                    "<td><p><br></p></td>" +
                    "<td><p><br></p></td>" +
                    "</tr>" +
                    '<tr style="height: 30px;">' +
                    "<td>ab</td>" +
                    "<td>cd</td>" +
                    "<td>ef[]</td>" +
                    "</tr></tbody></table>",
            });
        });
    });

    describe("below", () => {
        test("should add a row below the bottom row", async () => {
            await testEditor({
                contentBefore:
                    '<table><tbody><tr style="height: 20px;">' +
                    '<td style="width: 20px;">ab</td>' +
                    '<td style="width: 25px;">cd</td>' +
                    '<td style="width: 30px;">ef[]</td>' +
                    "</tr></tbody></table>",
                stepFunction: addRow("after"),
                contentAfter:
                    '<table><tbody><tr style="height: 20px;">' +
                    '<td style="width: 20px;">ab</td>' +
                    '<td style="width: 25px;">cd</td>' +
                    '<td style="width: 30px;">ef[]</td>' +
                    "</tr>" +
                    '<tr style="height: 20px;">' +
                    "<td><p><br></p></td>" +
                    "<td><p><br></p></td>" +
                    "<td><p><br></p></td>" +
                    "</tr></tbody></table>",
            });
        });

        test("should add a row below the middle row", async () => {
            await testEditor({
                contentBefore:
                    '<table><tbody><tr style="height: 20px;">' +
                    '<td style="width: 20px;">ab</td>' +
                    '<td style="width: 25px;">cd</td>' +
                    '<td style="width: 30px;">ef[]</td>' +
                    "</tr>" +
                    '<tr style="height: 30px;">' +
                    "<td>ab</td>" +
                    "<td>cd</td>" +
                    "<td>ef</td>" +
                    "</tr></tbody></table>",
                stepFunction: addRow("after"),
                contentAfter:
                    '<table><tbody><tr style="height: 20px;">' +
                    '<td style="width: 20px;">ab</td>' +
                    '<td style="width: 25px;">cd</td>' +
                    '<td style="width: 30px;">ef[]</td>' +
                    "</tr>" +
                    '<tr style="height: 20px;">' +
                    "<td><p><br></p></td>" +
                    "<td><p><br></p></td>" +
                    "<td><p><br></p></td>" +
                    "</tr>" +
                    '<tr style="height: 30px;">' +
                    "<td>ab</td>" +
                    "<td>cd</td>" +
                    "<td>ef</td>" +
                    "</tr></tbody></table>",
            });
        });
    });
});

describe("column", () => {
    describe("left", () => {
        test("should add a column left of the leftmost column", async () => {
            await testEditor({
                contentBefore:
                    '<table style="width: 150px;"><tbody><tr style="height: 20px;">' +
                    '<td style="width: 40px;">ab[]</td>' +
                    '<td style="width: 50px;">cd</td>' +
                    '<td style="width: 60px;">ef</td>' +
                    "</tr>" +
                    '<tr style="height: 30px;">' +
                    "<td>ab</td>" +
                    "<td>cd</td>" +
                    "<td>ef</td>" +
                    "</tr></tbody></table>",
                stepFunction: addColumn("before"),
                contentAfter:
                    '<table style="width: 150px;"><tbody><tr style="height: 20px;">' +
                    '<td style="width: 32px;"><p><br></p></td>' +
                    '<td style="width: 32px;">ab[]</td>' +
                    '<td style="width: 40px;">cd</td>' +
                    '<td style="width: 45px;">ef</td>' +
                    "</tr>" +
                    '<tr style="height: 30px;">' +
                    "<td><p><br></p></td>" +
                    "<td>ab</td>" +
                    "<td>cd</td>" +
                    "<td>ef</td>" +
                    "</tr></tbody></table>",
            });
        });

        test.todo("should add a column left of the middle column", async () => {
            await testEditor({
                contentBefore:
                    '<table style="width: 200px;"><tbody><tr style="height: 20px;">' +
                    '<td style="width: 50px;">ab</td>' +
                    '<td style="width: 65px;">cd</td>' +
                    '<td style="width: 85px;">ef</td>' +
                    "</tr>" +
                    '<tr style="height: 30px;">' +
                    "<td>ab</td>" +
                    "<td>cd[]</td>" +
                    "<td>ef</td>" +
                    "</tr>" +
                    '<tr style="height: 40px;">' +
                    "<td>ab</td>" +
                    "<td>cd</td>" +
                    "<td>ef</td>" +
                    "</tr></tbody></table>",
                stepFunction: addColumn("before"),
                contentAfter:
                    '<table style="width: 200px;"><tbody><tr style="height: 20px;">' +
                    '<td style="width: 38px;">ab</td>' +
                    '<td style="width: 50px;"><p><br></p></td>' +
                    '<td style="width: 50px;">cd</td>' +
                    '<td style="width: 61px;">ef</td>' +
                    "</tr>" +
                    '<tr style="height: 30px;">' +
                    "<td>ab</td>" +
                    "<td><p><br></p></td>" +
                    "<td>cd[]</td>" +
                    "<td>ef</td>" +
                    "</tr>" +
                    '<tr style="height: 40px;">' +
                    "<td>ab</td>" +
                    "<td><p><br></p></td>" +
                    "<td>cd</td>" +
                    "<td>ef</td>" +
                    "</tr></tbody></table>",
            });
        });
    });

    describe("right", () => {
        test("should add a column right of the rightmost column", async () => {
            await testEditor({
                contentBefore:
                    '<table style="width: 150px;"><tbody><tr style="height: 20px;">' +
                    '<td style="width: 40px;">ab</td>' +
                    '<td style="width: 50px;">cd</td>' +
                    '<td style="width: 60px;">ef[]</td>' +
                    "</tr>" +
                    '<tr style="height: 30px;">' +
                    "<td>ab</td>" +
                    "<td>cd</td>" +
                    "<td>ef</td>" +
                    "</tr></tbody></table>",
                stepFunction: addColumn("after"),
                contentAfter:
                    '<table style="width: 150px;"><tbody><tr style="height: 20px;">' +
                    '<td style="width: 29px;">ab</td>' +
                    '<td style="width: 36px;">cd</td>' +
                    '<td style="width: 41px;">ef[]</td>' +
                    // size was slightly adjusted to
                    // preserve table width in view on
                    // fractional division results
                    '<td style="width: 43px;"><p><br></p></td>' +
                    "</tr>" +
                    '<tr style="height: 30px;">' +
                    "<td>ab</td>" +
                    "<td>cd</td>" +
                    "<td>ef</td>" +
                    "<td><p><br></p></td>" +
                    "</tr></tbody></table>",
            });
        });

        test.todo("should add a column right of the middle column", async () => {
            await testEditor({
                contentBefore:
                    '<table style="width: 200px;"><tbody><tr style="height: 20px;">' +
                    '<td style="width: 50px;">ab</td>' +
                    '<td style="width: 65px;">cd</td>' +
                    '<td style="width: 85px;">ef</td>' +
                    "</tr>" +
                    '<tr style="height: 30px;">' +
                    "<td>ab</td>" +
                    "<td>cd[]</td>" +
                    "<td>ef</td>" +
                    "</tr>" +
                    '<tr style="height: 40px;">' +
                    "<td>ab</td>" +
                    "<td>cd</td>" +
                    "<td>ef</td>" +
                    "</tr></tbody></table>",
                stepFunction: addColumn("after"),
                contentAfter:
                    '<table style="width: 200px;"><tbody><tr style="height: 20px;">' +
                    '<td style="width: 38px;">ab</td>' +
                    '<td style="width: 50px;">cd</td>' +
                    '<td style="width: 50px;"><p><br></p></td>' +
                    '<td style="width: 61px;">ef</td>' +
                    "</tr>" +
                    '<tr style="height: 30px;">' +
                    "<td>ab</td>" +
                    "<td>cd[]</td>" +
                    "<td><p><br></p></td>" +
                    "<td>ef</td>" +
                    "</tr>" +
                    '<tr style="height: 40px;">' +
                    "<td>ab</td>" +
                    "<td>cd</td>" +
                    "<td><p><br></p></td>" +
                    "<td>ef</td>" +
                    "</tr></tbody></table>",
            });
        });
    });
});

describe("tab", () => {
    test("should add a new row on press tab at the end of a table", async () => {
        await testEditor({
            contentBefore:
                '<table><tbody><tr style="height: 20px;"><td style="width: 20px;">ab</td><td>cd</td><td>ef[]</td></tr></tbody></table>',
            stepFunction: async (editor) => dispatch(editor.editable, "keydown", { key: "Tab" }),
            contentAfter:
                '<table><tbody><tr style="height: 20px;"><td style="width: 20px;">ab</td><td>cd</td><td>ef</td></tr><tr style="height: 20px;"><td>[<p><br></p>]</td><td><p><br></p></td><td><p><br></p></td></tr></tbody></table>',
        });
    });
});
