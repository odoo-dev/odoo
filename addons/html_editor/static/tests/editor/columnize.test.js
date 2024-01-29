/** @odoo-module */

import { describe, test } from "@odoo/hoot";
import { testEditor } from "../test_helpers/editor";

function columnsContainer(contents) {
    return `<div class="container o_text_columns"><div class="row">${contents}</div></div>`;
}

function column(size, contents) {
    return `<div class="col-${size}">${contents}</div>`;
}

function columnize(numberOfColumns) {
    return (editor) => {
        throw new Error("Not implemented command: columnize");
    };
}

describe("2 columns", () => {
    test.todo("should do nothing", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(6, "<p>abcd</p>") + column(6, "<h1>[]ef</h1><ul><li>gh</li></ul>")
            ),
            stepFunction: columnize(2),
            contentAfter: columnsContainer(
                column(6, "<p>abcd</p>") + column(6, "<h1>[]ef</h1><ul><li>gh</li></ul>")
            ),
        });
    });

    test.todo("should turn text into 2 columns", async () => {
        await testEditor({
            contentBefore: "<p>[]abcd</p>",
            stepFunction: columnize(2),
            contentAfter:
                columnsContainer(column(6, "<p>[]abcd</p>") + column(6, "<p><br></p>")) +
                "<p><br></p>",
        });
    });

    test.todo("should turn 3 columns into 2 columns", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(4, "<p>abcd</p>") +
                    column(4, "<h1>e[]f</h1>") +
                    column(4, "<ul><li>gh</li></ul>")
            ),
            stepFunction: columnize(2),
            contentAfter: columnsContainer(
                column(6, "<p>abcd</p>") + column(6, "<h1>e[]f</h1><ul><li>gh</li></ul>")
            ),
        });
    });

    test.todo("should turn 4 columns into 2 columns", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(3, "<p>abcd</p>") +
                    column(3, "<h1>ef</h1>") +
                    column(3, "<ul><li>gh</li></ul>") +
                    column(3, "<p>i[]j</p>")
            ),
            stepFunction: columnize(2),
            contentAfter: columnsContainer(
                column(6, "<p>abcd</p>") + column(6, "<h1>ef</h1><ul><li>gh</li></ul><p>i[]j</p>")
            ),
        });
    });
});
describe("3 columns", () => {
    test.todo("should do nothing", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(4, "<p>abcd</p>") + column(4, "<p><br></p>") + column(4, "<p>[]<br></p>")
            ),
            stepFunction: columnize(3),
            contentAfter: columnsContainer(
                column(4, "<p>abcd</p>") + column(4, "<p><br></p>") + column(4, "<p>[]<br></p>")
            ),
        });
    });

    test.todo("should turn text into 3 columns", async () => {
        await testEditor({
            contentBefore: "<p>ab[]cd</p>",
            stepFunction: columnize(3),
            contentAfter:
                columnsContainer(
                    column(4, "<p>ab[]cd</p>") + column(4, "<p><br></p>") + column(4, "<p><br></p>")
                ) + "<p><br></p>",
        });
    });

    test.todo("should turn 2 columns into 3 columns", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(6, "<p>abcd</p>") + column(6, "<h1>ef</h1><ul><li>g[]h</li></ul>")
            ),
            stepFunction: columnize(3),
            contentAfter: columnsContainer(
                column(4, "<p>abcd</p>") +
                    column(4, "<h1>ef</h1><ul><li>g[]h</li></ul>") +
                    column(4, "<p><br></p>")
            ),
        });
    });

    test.todo("should turn 4 columns into 3 columns", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(3, "<p>abcd</p>") +
                    column(3, "<h1>e[]f</h1>") +
                    column(3, "<ul><li>gh</li></ul>") +
                    column(3, "<p>ij</p>")
            ),
            stepFunction: columnize(3),
            contentAfter: columnsContainer(
                column(4, "<p>abcd</p>") +
                    column(4, "<h1>e[]f</h1>") +
                    column(4, "<ul><li>gh</li></ul><p>ij</p>")
            ),
        });
    });
});

describe("4 columns", () => {
    test.todo("should do nothing", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(3, "<p>abcd</p>") +
                    column(3, "<p><br></p>") +
                    column(3, "<p><br></p>") +
                    column(3, "<p>[]<br></p>")
            ),
            stepFunction: columnize(4),
            contentAfter: columnsContainer(
                column(3, "<p>abcd</p>") +
                    column(3, "<p><br></p>") +
                    column(3, "<p><br></p>") +
                    column(3, "<p>[]<br></p>")
            ),
        });
    });

    test.todo("should turn text into 4 columns", async () => {
        await testEditor({
            contentBefore: "<p>abcd[]</p>",
            stepFunction: columnize(4),
            contentAfter:
                columnsContainer(
                    column(3, "<p>abcd[]</p>") +
                        column(3, "<p><br></p>") +
                        column(3, "<p><br></p>") +
                        column(3, "<p><br></p>")
                ) + "<p><br></p>",
        });
    });

    test.todo("should turn 2 columns into 4 columns", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(6, "<p>abcd</p>") + column(6, "<h1>[]ef</h1><ul><li>gh</li></ul>")
            ),
            stepFunction: columnize(4),
            contentAfter: columnsContainer(
                column(3, "<p>abcd</p>") +
                    column(3, "<h1>[]ef</h1><ul><li>gh</li></ul>") +
                    column(3, "<p><br></p>") +
                    column(3, "<p><br></p>")
            ),
        });
    });

    test.todo("should turn 3 columns into 4 columns", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(4, "<p>abcd</p>") +
                    column(4, "<h1>ef[]</h1>") +
                    column(4, "<ul><li>gh</li></ul><p>ij</p>")
            ),
            stepFunction: columnize(4),
            contentAfter: columnsContainer(
                column(3, "<p>abcd</p>") +
                    column(3, "<h1>ef[]</h1>") +
                    column(3, "<ul><li>gh</li></ul><p>ij</p>") +
                    column(3, "<p><br></p>")
            ),
        });
    });
});

describe("remove columns", () => {
    test.todo("should do nothing", async () => {
        await testEditor({
            contentBefore: "<p>ab[]cd</p>",
            stepFunction: columnize(0),
            contentAfter: "<p>ab[]cd</p>",
        });
    });

    test.todo("should turn 2 columns into text", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(6, "<p>abcd</p>") + column(6, "<h1>[]ef</h1><ul><li>gh</li></ul>")
            ),
            stepFunction: columnize(0),
            contentAfter: "<p>abcd</p><h1>[]ef</h1><ul><li>gh</li></ul>",
        });
    });

    test.todo("should turn 3 columns into text", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(4, "<p>abcd</p>") +
                    column(4, "<h1>ef[]</h1>") +
                    column(4, "<ul><li>gh</li></ul><p>ij</p>")
            ),
            stepFunction: columnize(0),
            contentAfter: "<p>abcd</p><h1>ef[]</h1><ul><li>gh</li></ul><p>ij</p>",
        });
    });

    test.todo("should turn 4 columns into text", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(3, "<p>abcd</p>") +
                    column(3, "<h1>ef</h1>") +
                    column(3, "<ul><li>gh</li></ul><p>ij</p>") +
                    column(3, "<p>[]<br></p>")
            ),
            stepFunction: columnize(0),
            contentAfter: "<p>abcd</p><h1>ef</h1><ul><li>gh</li></ul><p>ij</p><p>[]<br></p>",
        });
    });
});

describe("complex", () => {
    test.todo("should turn text into 2 columns, then 3, 4, 3, 2 and text again", async () => {
        await testEditor({
            contentBefore: "<p>ab[]cd</p>",
            stepFunction: (editor) => {
                editor.execCommand("columnize", 2);
                editor.execCommand("columnize", 3);
                editor.execCommand("columnize", 4);
                editor.execCommand("columnize", 3);
                editor.execCommand("columnize", 2);
                editor.execCommand("columnize", 0);
            },
            // A paragraph was created for each column + after them and
            // they were all kept.
            contentAfter: "<p>ab[]cd</p><p><br></p><p><br></p><p><br></p><p><br></p>",
        });
    });

    test.todo("should not add a container when one already exists", async () => {
        await testEditor({
            contentBefore:
                '<div class="container"><div class="row"><div class="col">' +
                "<p>ab[]cd</p>" +
                "</div></div></div>",
            stepFunction: columnize(2),
            contentAfter:
                '<div class="container"><div class="row"><div class="col">' +
                '<div class="o_text_columns"><div class="row">' + // no "container" class
                '<div class="col-6">' +
                "<p>ab[]cd</p>" +
                "</div>" +
                '<div class="col-6"><p><br></p></div>' +
                "</div></div>" +
                "<p><br></p>" +
                "</div></div></div>",
        });
    });
});
