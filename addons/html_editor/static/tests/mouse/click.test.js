import { test } from "@odoo/hoot";
import { testEditor } from "../_helpers/editor";
import { pointerDown, pointerUp } from "@odoo/hoot-dom";
import { tick } from "@odoo/hoot-mock";
import { leftPos, rightPos } from "@html_editor/utils/position";
import { setSelection } from "../_helpers/selection";

/**
 * Simulates placing the cursor at the editable root after a mouse click.
 *
 * @param {HTMLElement} node
 * @param {boolean} [after=false] whether to place the cursor after the node
 */
async function simulateMouseClick(node, after = false) {
    pointerDown(node);
    const pos = after ? leftPos(node) : rightPos(node);
    setSelection({
        anchorNode: pos[0],
        anchorOffset: pos[1],
        focusNode: pos[0],
        focusOffset: pos[1],
    });
    await tick();
    pointerUp(node);
}

test("should insert a paragraph at end of editable and place cursor in it (hr)", async () => {
    await testEditor({
        contentBefore: '<hr contenteditable="false">',
        stepFunction: async (editor) => {
            const hr = editor.editable.querySelector("hr");
            await simulateMouseClick(hr);
        },
        contentAfter: "<hr><p>[]<br></p>",
    });
});

test("should insert a paragraph at end of editable and place cursor in it (table)", async () => {
    await testEditor({
        contentBefore: "<table></table>",
        stepFunction: async (editor) => {
            const table = editor.editable.querySelector("table");
            await simulateMouseClick(table);
        },
        contentAfter: "<table></table><p>[]<br></p>",
    });
});

test("should insert a paragraph at beginning of editable and place cursor in it (1)", async () => {
    await testEditor({
        contentBefore: '<hr contenteditable="false">',
        stepFunction: async (editor) => {
            const hr = editor.editable.querySelector("hr");
            await simulateMouseClick(hr, true);
        },
        contentAfter: "<p>[]<br></p><hr>",
    });
});
test("should insert a paragraph at beginning of editable and place cursor in it (2)", async () => {
    await testEditor({
        contentBefore: "<table></table>",
        stepFunction: async (editor) => {
            const table = editor.editable.querySelector("table");
            await simulateMouseClick(table, true);
        },
        contentAfter: "<p>[]<br></p><table></table>",
    });
});

test("should insert a paragraph between the two non-P blocks and place cursor in it (1)", async () => {
    await testEditor({
        contentBefore: '<hr contenteditable="false"><hr contenteditable="false">',
        stepFunction: async (editor) => {
            const firstHR = editor.editable.querySelector("hr");
            await simulateMouseClick(firstHR);
        },
        contentAfter: "<hr><p>[]<br></p><hr>",
    });
});
test("should insert a paragraph between the two non-P blocks and place cursor in it (2)", async () => {
    await testEditor({
        contentBefore: "<table></table><table></table>",
        stepFunction: async (editor) => {
            const firstTable = editor.editable.querySelector("table");
            await simulateMouseClick(firstTable);
        },
        contentAfter: "<table></table><p>[]<br></p><table></table>",
    });
});
