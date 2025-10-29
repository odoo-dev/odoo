import { describe, expect, manuallyDispatchProgrammaticEvent, test } from "@odoo/hoot";
import { press, queryAllTexts, tick } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { setupEditor, testEditor } from "./_helpers/editor";
import { getContent, setSelection } from "./_helpers/selection";
import { insertText, redo, undo } from "./_helpers/user_actions";
import { execCommand } from "./_helpers/userCommands";
import { nodeSize } from "@html_editor/utils/position";
import { unformat } from "./_helpers/format";
import { MIN_WIDTH_PX } from "@html_editor/main/column/column_resize_plugin";

function columnsContainer(contents) {
    return `<div class="container o_text_columns o-contenteditable-false"><div class="row">${contents}</div></div>`;
}

function column(size, contents) {
    return `<div class="col-${size} o-contenteditable-true">${contents}</div>`;
}

function columsDuringEditContainer(contents) {
    return `<p data-selection-placeholder=""><br></p><div class="container o_text_columns o-contenteditable-false" contenteditable="false"><div class="row">${contents}</div></div><p data-selection-placeholder=""><br></p>`;
}

function columnDuringEdit(size, contents) {
    return `<div class="col-${size} o-contenteditable-true" contenteditable="true">${contents}</div>`;
}

function columnize(numberOfColumns) {
    return (editor) => {
        execCommand(editor, "columnize", numberOfColumns);
    };
}

describe("2 columns", () => {
    test("should display hint for focused empty column.", async () => {
        await testEditor({
            /* eslint-disable */
            contentBefore:
                columnsContainer(
                    column(6, "<p>[]<br></p>") +
                    column(6, "<p><br></p>")
                ),
            contentAfterEdit:
                columsDuringEditContainer(
                    columnDuringEdit(6, `<p o-we-hint-text="Empty column" class="o-we-hint">[]<br></p>`) +
                    columnDuringEdit(6, `<p o-we-hint-text="Empty column" class="o-we-hint"><br></p>`)
                ),
            /* eslint-enable */
        });
    });

    test("should display the normal hint when cursor is in an empty cell of an empty table in one of the columns", async () => {
        await testEditor({
            /* eslint-disable */
            contentBefore:
                columnsContainer(
                    column(6, `<table><tbody><tr><td><p>[]<br></p></td><td><p><br></p></td></tr></tbody></table>`) +
                    column(6, "<p><br></p>")
                ),
            contentAfterEdit:
                columsDuringEditContainer(
                    columnDuringEdit(6, `<p data-selection-placeholder=""><br></p><table><tbody><tr><td><p o-we-hint-text='Type "/" for commands' class="o-we-hint">[]<br></p></td><td><p><br></p></td></tr></tbody></table><p data-selection-placeholder=""><br></p>`) +
                    columnDuringEdit(6, `<p o-we-hint-text="Empty column" class="o-we-hint"><br></p>`)
                ),
            /* eslint-enable */
        });
    });

    test("should do nothing", async () => {
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

    test("should turn text into 2 columns", async () => {
        await testEditor({
            contentBefore: "<p>[]abcd</p>",
            stepFunction: columnize(2),
            contentAfterEdit:
            /* eslint-disable */
                columsDuringEditContainer(
                    columnDuringEdit(6, "<p>[]abcd</p>") +
                    columnDuringEdit(6, `<p o-we-hint-text="Empty column" class="o-we-hint"><br></p>`)
                ),
            contentAfter:
                columnsContainer(
                    column(6, "<p>[]abcd</p>") +
                    column(6, "<p><br></p>")
                )
            /* eslint-enable */
        });
    });

    test("should turn 3 columns into 2 columns", async () => {
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

    test("should turn 4 columns into 2 columns", async () => {
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

    test("apply '2 columns' powerbox command", async () => {
        const { el, editor } = await setupEditor("<p>ab[]cd</p>");
        await insertText(editor, "/2columns");
        await animationFrame();
        expect(".active .o-we-command-name").toHaveText("2 columns");

        await press("enter");
        expect(getContent(el)).toBe(
            `<p data-selection-placeholder=""><br></p><div class="container o_text_columns o-contenteditable-false" contenteditable="false"><div class="row"><div class="col-6 o-contenteditable-true" contenteditable="true"><p>ab[]cd</p></div><div class="col-6 o-contenteditable-true" contenteditable="true"><p o-we-hint-text="Empty column" class="o-we-hint"><br></p></div></div></div><p data-selection-placeholder=""><br></p>`
        );

        await insertText(editor, "/columns");
        await animationFrame();
        expect(queryAllTexts(".o-we-command-name")).toEqual([
            "3 columns",
            "4 columns",
            "Remove columns",
        ]);
    });
});
describe("3 columns", () => {
    test("should do nothing", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(4, "<p>abcd</p>") + column(4, "<p><br></p>") + column(4, "<p>[]<br></p>")
            ),
            /* eslint-disable */
            contentBeforeEdit:
                columsDuringEditContainer(
                    columnDuringEdit(4, "<p>abcd</p>") +
                    columnDuringEdit(4, `<p o-we-hint-text="Empty column" class="o-we-hint"><br></p>`) +
                    columnDuringEdit(4, `<p o-we-hint-text="Empty column" class="o-we-hint">[]<br></p>`)
                ),
            /* eslint-enable */
            stepFunction: columnize(3),
            contentAfter: columnsContainer(
                column(4, "<p>abcd</p>") + column(4, "<p><br></p>") + column(4, "<p>[]<br></p>")
            ),
        });
    });

    test("should turn text into 3 columns", async () => {
        await testEditor({
            contentBefore: "<p>ab[]cd</p>",
            stepFunction: columnize(3),
            /* eslint-disable */
            contentAfterEdit:
                columsDuringEditContainer(
                    columnDuringEdit(4, "<p>ab[]cd</p>") +
                    columnDuringEdit(4, `<p o-we-hint-text="Empty column" class="o-we-hint"><br></p>`) +
                    columnDuringEdit(4, `<p o-we-hint-text="Empty column" class="o-we-hint"><br></p>`)
                ),
            contentAfter:
                columnsContainer(
                    column(4, "<p>ab[]cd</p>") +
                    column(4, "<p><br></p>") +
                    column(4, "<p><br></p>")
                ),
            /* eslint-enable */
        });
    });

    test("should turn 2 columns into 3 columns", async () => {
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

    test("should turn 4 columns into 3 columns", async () => {
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

    test("apply '3 columns' powerbox command", async () => {
        const { el, editor } = await setupEditor("<p>ab[]cd</p>");
        await insertText(editor, "/3columns");
        await animationFrame();
        expect(".active .o-we-command-name").toHaveText("3 columns");

        await press("enter");
        expect(getContent(el)).toBe(
            `<p data-selection-placeholder=""><br></p><div class="container o_text_columns o-contenteditable-false" contenteditable="false"><div class="row"><div class="col-4 o-contenteditable-true" contenteditable="true"><p>ab[]cd</p></div><div class="col-4 o-contenteditable-true" contenteditable="true"><p o-we-hint-text="Empty column" class="o-we-hint"><br></p></div><div class="col-4 o-contenteditable-true" contenteditable="true"><p o-we-hint-text="Empty column" class="o-we-hint"><br></p></div></div></div><p data-selection-placeholder=""><br></p>`
        );

        await insertText(editor, "/columns");
        await animationFrame();
        expect(queryAllTexts(".o-we-command-name")).toEqual([
            "2 columns",
            "4 columns",
            "Remove columns",
        ]);
    });
});

describe("4 columns", () => {
    test("should do nothing", async () => {
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

    test("should turn text into 4 columns", async () => {
        await testEditor({
            contentBefore: "<p>abcd[]</p>",
            stepFunction: columnize(4),
            contentAfter: columnsContainer(
                column(3, "<p>abcd[]</p>") +
                    column(3, "<p><br></p>") +
                    column(3, "<p><br></p>") +
                    column(3, "<p><br></p>")
            ),
        });
    });

    test("should turn 2 columns into 4 columns", async () => {
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

    test("should turn 3 columns into 4 columns", async () => {
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

    test("apply '4 columns' powerbox command", async () => {
        const { el, editor } = await setupEditor("<p>ab[]cd</p>");
        await insertText(editor, "/4columns");
        await animationFrame();
        expect(".active .o-we-command-name").toHaveText("4 columns");

        await press("enter");
        expect(getContent(el)).toBe(
            `<p data-selection-placeholder=""><br></p><div class="container o_text_columns o-contenteditable-false" contenteditable="false"><div class="row"><div class="col-3 o-contenteditable-true" contenteditable="true"><p>ab[]cd</p></div><div class="col-3 o-contenteditable-true" contenteditable="true"><p o-we-hint-text="Empty column" class="o-we-hint"><br></p></div><div class="col-3 o-contenteditable-true" contenteditable="true"><p o-we-hint-text="Empty column" class="o-we-hint"><br></p></div><div class="col-3 o-contenteditable-true" contenteditable="true"><p o-we-hint-text="Empty column" class="o-we-hint"><br></p></div></div></div><p data-selection-placeholder=""><br></p>`
        );

        await insertText(editor, "/columns");
        await animationFrame();
        expect(queryAllTexts(".o-we-command-name")).toEqual([
            "2 columns",
            "3 columns",
            "Remove columns",
        ]);
    });
});

describe("remove columns", () => {
    test("should do nothing", async () => {
        await testEditor({
            contentBefore: "<p>ab[]cd</p>",
            stepFunction: columnize(0),
            contentAfter: "<p>ab[]cd</p>",
        });
    });

    test("should turn 2 columns into text", async () => {
        await testEditor({
            contentBefore: columnsContainer(
                column(6, "<p>abcd</p>") + column(6, "<h1>[]ef</h1><ul><li>gh</li></ul>")
            ),
            stepFunction: columnize(0),
            contentAfter: "<p>abcd</p><h1>[]ef</h1><ul><li>gh</li></ul>",
        });
    });

    test("should turn 3 columns into text", async () => {
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

    test("should turn 4 columns into text", async () => {
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

    test("apply 'remove columns' powerbox command", async () => {
        const { el, editor } = await setupEditor("<p>ab[]cd</p>");
        await insertText(editor, "/columns");
        await animationFrame();
        expect(queryAllTexts(".o-we-command-name")).toEqual([
            "2 columns",
            "3 columns",
            "4 columns",
        ]);

        // add 2 columns
        await press("enter");
        expect(getContent(el)).toBe(
            `<p data-selection-placeholder=""><br></p><div class="container o_text_columns o-contenteditable-false" contenteditable="false"><div class="row"><div class="col-6 o-contenteditable-true" contenteditable="true"><p>ab[]cd</p></div><div class="col-6 o-contenteditable-true" contenteditable="true"><p o-we-hint-text="Empty column" class="o-we-hint"><br></p></div></div></div><p data-selection-placeholder=""><br></p>`
        );

        await insertText(editor, "/removecolumns");
        await animationFrame();
        expect(".active .o-we-command-name").toHaveText("Remove columns");
        await press("enter");
        expect(getContent(el)).toBe(`<p>ab[]cd</p><p><br></p>`);
    });
});

describe("complex", () => {
    test("should turn text into 2 columns, then 3, 4, 3, 2 and text again", async () => {
        await testEditor({
            contentBefore: "<p>ab[]cd</p>",
            stepFunction: (editor) => {
                columnize(2)(editor);
                columnize(3)(editor);
                columnize(4)(editor);
                columnize(3)(editor);
                columnize(2)(editor);
                columnize(0)(editor);
            },
            // A paragraph was created for each column + after them and
            // they were all kept.
            contentAfter: "<p>ab[]cd</p><p><br></p><p><br></p><p><br></p>",
        });
    });

    test("should not add a container when one already exists", async () => {
        await testEditor({
            contentBefore:
                '<div class="container o-contenteditable-false"><div class="row"><div class="col o-contenteditable-true">' +
                "<p>ab[]cd</p>" +
                "</div></div></div>",
            stepFunction: columnize(2),
            contentAfter:
                '<div class="container o-contenteditable-false"><div class="row"><div class="col o-contenteditable-true">' +
                '<div class="o_text_columns o-contenteditable-false"><div class="row">' + // no "container" class
                '<div class="col-6 o-contenteditable-true">' +
                "<p>ab[]cd</p>" +
                "</div>" +
                '<div class="col-6 o-contenteditable-true"><p><br></p></div>' +
                "</div></div>" +
                "</div></div></div>",
        });
    });
});

describe("undo", () => {
    test("should be able to write after undo", async () => {
        await testEditor({
            contentBefore: "<p>[]</p>",
            stepFunction: async (editor) => {
                columnize(2)(editor);
                undo(editor);
                await insertText(editor, "x");
            },
            contentAfter: "<p>x[]</p>",
        });
    });

    test("should work properly after undo and then redo", async () => {
        await testEditor({
            contentBefore: "<p>[]</p>",
            stepFunction: async (editor) => {
                columnize(2)(editor);
                undo(editor);
                redo(editor);
                await insertText(editor, "x");
            },
            contentAfter: columnsContainer(column(6, "<p>x[]</p>") + column(6, "<p><br></p>")),
        });
    });
});

describe("selection", () => {
    test("should be able to select across columns using Shift + ArrowUp", async () => {
        await testEditor({
            contentBefore: "<p>a</p><p>b[]</p>",
            stepFunction: async (editor) => {
                columnize(2)(editor);
                const editable = editor.editable;
                const children = editable.querySelectorAll("p");
                const lastP = children[children.length - 1];
                lastP.innerHTML = "ab";
                setSelection({ anchorNode: lastP.firstChild, anchorOffset: 0 });
                await tick(); // wait for trailing placeholder to be persisted via selectionchange
                await press(["shift", "arrowUp"]);
            },
            contentAfter:
                "<p>a]</p>" +
                columnsContainer(column(6, "<p>b</p>") + column(6, "<p><br></p>")) +
                "<p>[ab</p>",
        });
    });
    test("should be able to select across columns using Shift + ArrowDown", async () => {
        await testEditor({
            contentBefore: "<p>a</p><p>b[]</p>",
            stepFunction: async (editor) => {
                columnize(2)(editor);
                const editable = editor.editable;
                const children = editable.querySelectorAll("p");
                const lastP = children[children.length - 1];
                lastP.innerHTML = "ab";
                // Persist the trailing placeholder
                setSelection({ anchorNode: lastP.lastChild, anchorOffset: nodeSize(lastP) });
                await tick();
                const firstP = children[0];
                setSelection({ anchorNode: firstP.lastChild, anchorOffset: nodeSize(firstP) });
                await press(["shift", "arrowDown"]);
            },
            contentAfter:
                "<p>a[</p>" +
                columnsContainer(column(6, "<p>b</p>") + column(6, "<p><br></p>")) +
                "<p>]ab</p>",
        });
    });
});

describe("helper hint", () => {
    test("should display helper hint in first block of each column", async () => {
        await testEditor({
            /* eslint-disable */
            contentBefore:
                columnsContainer(
                    column(4, "<p>[]<br></p>") +
                    column(4, "<h1><br></h1>" + "<h2><br></h2>") +
                    column(4, "<p><br></p>")
                ),
            contentAfterEdit:
                columsDuringEditContainer(
                    columnDuringEdit(4, `<p o-we-hint-text="Empty column" class="o-we-hint">[]<br></p>`) +
                    columnDuringEdit(4, `<h1 o-we-hint-text="Heading 1" class="o-we-hint"><br></h1>` + "<h2><br></h2>") +
                    columnDuringEdit(4, `<p o-we-hint-text="Empty column" class="o-we-hint"><br></p>`)
                ),
            /* eslint-enable */
        });
    });

    test("should not display hint in first block if cursor is inside different block in same column", async () => {
        await testEditor({
            /* eslint-disable */
            contentBefore:
                columnsContainer(
                    column(4, "<p><br></p>") +
                    column(4, "<h1><br></h1>" + "<h2>[]<br></h2>") +
                    column(4, "<p><br></p>")
                ),
            contentAfterEdit:
                columsDuringEditContainer(
                    columnDuringEdit(4, `<p o-we-hint-text="Empty column" class="o-we-hint"><br></p>`) +
                    columnDuringEdit(4, "<h1><br></h1>" + `<h2 o-we-hint-text="Heading 2" class="o-we-hint">[]<br></h2>`) +
                    columnDuringEdit(4, `<p o-we-hint-text="Empty column" class="o-we-hint"><br></p>`)
                ),
            /* eslint-enable */
        });
    });

    test("should display normal hint on focused paragraph if paragraph is not first block of column", async () => {
        await testEditor({
            /* eslint-disable */
            contentBefore:
                columnsContainer(
                    column(4, "<p><br></p>" + "<p>[]<br></p>") +
                    column(4, "<p><br></p>") +
                    column(4, "<p><br></p>")
                ),
            contentAfterEdit:
                columsDuringEditContainer(
                    columnDuringEdit(4, "<p><br></p>" + `<p o-we-hint-text='Type "/" for commands' class="o-we-hint">[]<br></p>`) +
                    columnDuringEdit(4, `<p o-we-hint-text="Empty column" class="o-we-hint"><br></p>`) +
                    columnDuringEdit(4, `<p o-we-hint-text="Empty column" class="o-we-hint"><br></p>`)
                ),
            /* eslint-enable */
        });
    });
});

describe("column resize", () => {
    test("shrink first column by dragging left & row width unchanged", async () => {
        const { el } = await setupEditor(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1200px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p><br></p>
            `)
        );

        const row = el.querySelector(".o_text_columns .row");
        const firstColumn = row.firstChild;
        const firstColumnRect = firstColumn.getBoundingClientRect();
        const initialColumnWidth = firstColumnRect.width;
        const initialRowWidth = row.offsetWidth;

        // Hover over the first column to display the resize handle
        manuallyDispatchProgrammaticEvent(firstColumn, "pointermove", {
            clientX: firstColumnRect.right,
        });

        const columnResizeHandle = document.querySelector(".o_we_column_resize_handle");
        expect(columnResizeHandle).not.toHaveClass("d-none");

        // Start resizing (pointer down on the handle)
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointerdown", {
            clientX: firstColumnRect.right,
        });

        // Drag left to shrink the first column
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointermove", {
            clientX: firstColumnRect.right - initialColumnWidth / 3,
        });
        await animationFrame();

        // Finish resizing (pointer up)
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointerup", {
            clientX: firstColumnRect.right - initialColumnWidth / 3,
        });

        const finalFirstColumnWidth = firstColumn.getBoundingClientRect().width;
        const finalRowWidth = row.offsetWidth;

        // Column width should decrease
        expect(finalFirstColumnWidth).toBeLessThan(initialColumnWidth);
        // Row width should remain unchanged
        expect(finalRowWidth).toEqual(initialRowWidth);
        expect(getContent(el)).toBe(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1200px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 200px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p><br></p>
            `)
        );
    });

    test("expand first column by dragging right and row width unchanged", async () => {
        const { el } = await setupEditor(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1200px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p><br></p>
            `)
        );

        const row = el.querySelector(".o_text_columns .row");
        const firstColumn = row.firstChild;
        const firstColumnRect = firstColumn.getBoundingClientRect();
        const initialColumnWidth = firstColumnRect.width;
        const initialRowWidth = row.offsetWidth;

        // Hover over the first column to display the resize handle
        manuallyDispatchProgrammaticEvent(firstColumn, "pointermove", {
            clientX: firstColumnRect.right,
        });

        const columnResizeHandle = document.querySelector(".o_we_column_resize_handle");
        expect(columnResizeHandle).not.toHaveClass("d-none");

        // Start resizing (pointer down on the handle)
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointerdown", {
            clientX: firstColumnRect.right,
        });

        // Drag right to expand the first column
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointermove", {
            clientX: firstColumnRect.right + initialColumnWidth / 3,
        });
        await animationFrame();

        // Finish resizing (pointer up)
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointerup", {
            clientX: firstColumnRect.right + initialColumnWidth / 3,
        });

        const finalFirstColumnWidth = firstColumn.getBoundingClientRect().width;
        const finalRowWidth = row.offsetWidth;

        // Column width should increase
        expect(finalFirstColumnWidth).toBeGreaterThan(initialColumnWidth);
        // Row width should remain unchanged
        expect(finalRowWidth).toEqual(initialRowWidth);
        expect(getContent(el)).toBe(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1200px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 200px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p><br></p>
            `)
        );
    });

    test("shrink last column by dragging left and row width decreases", async () => {
        const { el } = await setupEditor(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1200px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p><br></p>
            `)
        );

        const row = el.querySelector(".o_text_columns .row");
        const lastColumn = row.lastChild;
        const lastColumnRect = lastColumn.getBoundingClientRect();
        const initialColumnWidth = lastColumnRect.width;
        const initialRowWidth = row.offsetWidth;

        // Hover over last column to display the resize handle
        manuallyDispatchProgrammaticEvent(lastColumn, "pointermove", {
            clientX: lastColumnRect.right,
        });

        const columnResizeHandle = document.querySelector(".o_we_column_resize_handle");
        expect(columnResizeHandle).not.toHaveClass("d-none");

        // Start resizing (pointer down)
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointerdown", {
            clientX: lastColumnRect.right,
        });

        // Drag left to shrink last column width
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointermove", {
            clientX: lastColumnRect.right - initialColumnWidth / 3,
        });
        await animationFrame();

        // Finish resizing (pointer up)
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointerup", {
            clientX: lastColumnRect.right - initialColumnWidth / 3,
        });

        const finalColumnWidth = lastColumn.getBoundingClientRect().width;
        const finalRowWidth = row.offsetWidth;

        // Column width should decrease
        expect(finalColumnWidth).toBeLessThan(initialColumnWidth);
        // Row width should also decrease
        expect(finalRowWidth).toBeLessThan(initialRowWidth);
        expect(getContent(el)).toBe(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1100px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 200px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p><br></p>
            `)
        );
    });

    test("expand last column by dragging right and row width increases", async () => {
        const { el } = await setupEditor(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1200px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p><br></p>
            `)
        );

        const row = el.querySelector(".o_text_columns .row");
        const lastColumn = row.lastChild;
        const lastColumnRect = lastColumn.getBoundingClientRect();
        const initialColumnWidth = lastColumnRect.width;
        const initialRowWidth = row.offsetWidth;

        // Hover over last column to show the resize handle
        manuallyDispatchProgrammaticEvent(lastColumn, "pointermove", {
            clientX: lastColumnRect.right,
        });

        const columnResizeHandle = document.querySelector(".o_we_column_resize_handle");
        expect(columnResizeHandle).not.toHaveClass("d-none");

        // Start resizing (pointer down)
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointerdown", {
            clientX: lastColumnRect.right,
        });

        // Drag right to expand last column width
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointermove", {
            clientX: lastColumnRect.right + initialColumnWidth / 3,
        });
        await animationFrame();

        // Finish resizing (pointer up)
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointerup", {
            clientX: lastColumnRect.right + initialColumnWidth / 3,
        });

        const finalColumnWidth = lastColumn.getBoundingClientRect().width;
        const finalRowWidth = row.offsetWidth;

        // Column width should increase
        expect(finalColumnWidth).toBeGreaterThan(initialColumnWidth);
        // Row width should also increase
        expect(finalRowWidth).toBeGreaterThan(initialRowWidth);
        expect(getContent(el)).toBe(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 1300px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p><br></p>

            `)
        );
    });

    test("undo/redo should work when resizing columns", async () => {
        const { el, editor } = await setupEditor(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 600px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p><br></p>
            `)
        );

        const row = el.querySelector(".o_text_columns .row");
        const firstColumn = row.firstChild;
        const firstColumnRect = firstColumn.getBoundingClientRect();
        const initialColumnWidth = firstColumnRect.width;

        // Hover over the first column to display the resize handle
        manuallyDispatchProgrammaticEvent(firstColumn, "pointermove", {
            clientX: firstColumnRect.right,
        });

        const columnResizeHandle = document.querySelector(".o_we_column_resize_handle");
        expect(columnResizeHandle).not.toHaveClass("d-none");

        // Start resizing (pointer down)
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointerdown", {
            clientX: firstColumnRect.right,
        });

        // Drag far left, trying to shrink column beyond allowed minimum
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointermove", {
            clientX: firstColumnRect.right - initialColumnWidth,
        });
        await animationFrame();

        // Finish resizing (pointer up)
        manuallyDispatchProgrammaticEvent(columnResizeHandle, "pointerup", {
            clientX: firstColumnRect.right - initialColumnWidth,
        });

        const finalWidth = firstColumn.getBoundingClientRect().width;
        // Column width should not go below MIN_WIDTH_PX
        expect(finalWidth).toEqual(MIN_WIDTH_PX);
        expect(getContent(el)).toBe(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 600px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 200px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p><br></p>
            `)
        );

        // Undo the resize
        undo(editor);
        expect(getContent(el)).toBe(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 600px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 300px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p><br></p>
            `)
        );

        // Redo the resize
        redo(editor);
        expect(getContent(el)).toBe(
            unformat(`
                <div class="container o_text_columns o-contenteditable-false" contenteditable="false">
                    <div class="row" style="width: 600px;">
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 200px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint">[]</p>
                        </div>
                        <div class="col-4 o-contenteditable-true" contenteditable="true" style="width: 400px;">
                            <p o-we-hint-text="Empty column" class="o-we-hint"><br></p>
                        </div>
                    </div>
                </div>
                <p><br></p>
            `)
        );
    });
});
