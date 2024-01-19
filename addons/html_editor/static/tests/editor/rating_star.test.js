/** @odoo-module */

import { test } from "@odoo/hoot";
import { dispatch } from "@odoo/hoot-dom";
import { deleteBackward, insertText, testEditor } from "../helpers";

/**
 * Rating Star Element Tests
 */

test.todo("add star elements", async () => {
    await testEditor({
        contentBefore: "<p>[]</p>",
        stepFunction: async (editor) => {
            await insertText(editor, "/");
            await insertText(editor, "3star");
            await dispatch(editor.editable, "keyup");
            await dispatch(editor.editable, "keydown", { key: "Enter" });
            // TODO @phoenix check if this is still needed nextTick
            // await nextTick();
        },
        contentAfterEdit: `<p>\u200B<span contenteditable="false" class="o_stars o_three_stars" id="checkId-1"><i class="fa fa-star-o" contenteditable="false">\u200B</i><i class="fa fa-star-o" contenteditable="false">\u200B</i><i class="fa fa-star-o" contenteditable="false">\u200B</i></span>\u200B[]</p>`,
    });
    await testEditor({
        contentBefore: "<p>[]</p>",
        stepFunction: async (editor) => {
            await insertText(editor, "/");
            await insertText(editor, "5star");
            await dispatch(editor.editable, "keyup");
            await dispatch(editor.editable, "keydown", { key: "Enter" });
            // TODO @phoenix check if this is still needed nextTick
            // await nextTick();
        },
        contentAfterEdit: `<p>\u200B<span contenteditable="false" class="o_stars o_five_stars" id="checkId-1"><i class="fa fa-star-o" contenteditable="false">\u200B</i><i class="fa fa-star-o" contenteditable="false">\u200B</i><i class="fa fa-star-o" contenteditable="false">\u200B</i><i class="fa fa-star-o" contenteditable="false">\u200B</i><i class="fa fa-star-o" contenteditable="false">\u200B</i></span>\u200B[]</p>`,
    });
});

test.todo("should delete star rating elements when delete is pressed twice", async () => {
    await testEditor({
        contentBefore: `<p>\u200B<span contenteditable="false" class="o_stars o_three_stars"><i class="fa fa-star-o" id="checkId-1" contenteditable="false">\u200B</i><i class="o_stars fa fa-star-o" id="checkId-2" contenteditable="false">\u200B</i><i class="o_stars fa fa-star-o" id="checkId-3" contenteditable="false">\u200B</i></span>\u200B[]</p>`,
        stepFunction: async (editor) => {
            await deleteBackward(editor);
            await deleteBackward(editor);
        },
        contentAfter: "<p>\u200B[]<br></p>",
    });
});
