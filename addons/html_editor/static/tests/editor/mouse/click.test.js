/** @odoo-module */

import { childNodeIndex } from "@html_editor/editor/utils/position";
import { test } from "@odoo/hoot";
import { dispatch } from "@odoo/hoot-dom";
import { testEditor } from "../../helpers";

// Simulates placing the cursor at the editable root after a mouse click.
async function simulateMouseClick(editor, node, after = false) {
    let editableChild = node;
    while (editableChild.parentNode !== editor.editable) {
        editableChild = editableChild.parentNode;
    }
    const index = after ? childNodeIndex(editableChild) + 1 : childNodeIndex(editableChild);
    const pos = [editor.editable, index];
    dispatch(editor.editable, "mousedown");
    const selection = editor.document.getSelection();
    selection.setBaseAndExtent(...pos, ...pos);

    //TODO @phoenix check if this is still needed nextTick
    // await nextTick();
    dispatch(editor.editable, "mouseup");
    dispatch(editor.editable, "click");
}

test.todo("should insert a paragraph at end of editable and place cursor in it", async () => {
    await testEditor({
        contentBefore: '<hr contenteditable="false">',
        stepFunction: async (editor) => {
            const hr = editor.editable.querySelector("hr");
            await simulateMouseClick(editor, hr, true);
        },
        contentAfter: '<hr contenteditable="false"><p>[]<br></p>',
    });
    await testEditor({
        contentBefore: "<table></table>",
        stepFunction: async (editor) => {
            const table = editor.editable.querySelector("table");
            await simulateMouseClick(editor, table, true);
        },
        contentAfter: "<table></table><p>[]<br></p>",
    });
});

test.todo("should insert a paragraph at beginning of editable and place cursor in it", async () => {
    await testEditor({
        contentBefore: '<hr contenteditable="false">',
        stepFunction: async (editor) => {
            const hr = editor.editable.querySelector("hr");
            await simulateMouseClick(editor, hr, false);
        },
        contentAfter: '<p>[]<br></p><hr contenteditable="false">',
    });
    await testEditor({
        contentBefore: "<table></table>",
        stepFunction: async (editor) => {
            const table = editor.editable.querySelector("table");
            await simulateMouseClick(editor, table, false);
        },
        contentAfter: "<p>[]<br></p><table></table>",
    });
});

test.todo(
    "should insert a paragraph between the two non-P blocks and place cursor in it",
    async () => {
        await testEditor({
            contentBefore: '<hr contenteditable="false"><hr contenteditable="false">',
            stepFunction: async (editor) => {
                const firstHR = editor.editable.querySelector("hr");
                await simulateMouseClick(editor, firstHR, true);
            },
            contentAfter: '<hr contenteditable="false"><p>[]<br></p><hr contenteditable="false">',
        });
        await testEditor({
            contentBefore: "<table></table><table></table>",
            stepFunction: async (editor) => {
                const firstTable = editor.editable.querySelector("table");
                await simulateMouseClick(editor, firstTable, true);
            },
            contentAfter: "<table></table><p>[]<br></p><table></table>",
        });
    }
);
