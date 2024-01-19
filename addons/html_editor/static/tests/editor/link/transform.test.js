/** @odoo-module */

import { test } from "@odoo/hoot";
import { dispatch } from "@odoo/hoot-dom";
import { insertText, testEditor } from "../../helpers";

/**
 * Automatic link creation when pressing Space, Enter or Shift+Enter after an url
 */
test.todo("should transform url after space", async () => {
    await testEditor({
        contentBefore: "<p>a http://test.com b http://test.com[] c http://test.com d</p>",
        stepFunction: async (editor) => {
            editor.testMode = false;
            await insertText(editor, " ");
        },
        contentAfter:
            '<p>a http://test.com b <a href="http://test.com">http://test.com</a>[] c http://test.com d</p>',
        //in reality: '<p>a http://test.com b <a href="http://test.com">http://test.com</a>&nbsp;[] c http://test.com d</p>'
    });
    await testEditor({
        contentBefore: "<p>http://test.com[]</p>",
        stepFunction: async (editor) => {
            // Setup: simulate multiple text nodes in a p: <p>"http://test" ".com"</p>
            editor.editable.firstChild.firstChild.splitText(11);
            // Action: insert space
            insertText(editor, " ");
        },
        contentAfter: '<p><a href="http://test.com">http://test.com</a> []</p>',
    });
});

test.todo("should transform url after enter", async () => {
    await testEditor({
        contentBefore: "<p>a http://test.com b http://test.com[] c http://test.com d</p>",
        stepFunction: async (editor) => {
            dispatch(editor.editable, "keydown", { key: "Enter" });
            dispatch(editor.editable, "input", { data: " ", inputType: "insertParagraph" });
            dispatch(editor.editable, "keyup", { key: "Enter" });
        },
        contentAfter:
            '<p>a http://test.com b <a href="http://test.com">http://test.com</a></p><p>[]&nbsp;c http://test.com d</p>',
    });
});

test.todo("should transform url after shift+enter", async () => {
    await testEditor({
        contentBefore: "<p>a http://test.com b http://test.com[] c http://test.com d</p>",
        stepFunction: async (editor) => {
            dispatch(editor.editable, "keydown", { key: "Enter", shiftKey: true });
            dispatch(editor.editable, "keyup", { key: "Enter", shiftKey: true });
        },
        contentAfter:
            '<p>a http://test.com b <a href="http://test.com">http://test.com</a><br>[]&nbsp;c http://test.com d</p>',
    });
});

test.todo("should not transform an email url after space", async () => {
    await testEditor({
        contentBefore: "<p>user@domain.com[]</p>",
        stepFunction: async (editor) => {
            editor.testMode = false;
            const selection = document.getSelection();
            const anchorOffset = selection.anchorOffset;
            const p = editor.editable.querySelector("p");
            const textNode = p.childNodes[0];
            await dispatch(editor.editable, "keydown", { key: " ", code: "Space" });
            textNode.textContent = "user@domain.com\u00a0";
            selection.extend(textNode, anchorOffset + 1);
            selection.collapseToEnd();
            await dispatch(editor.editable, "input", { data: " ", inputType: "insertText" });
            await dispatch(editor.editable, "keyup", { key: " ", code: "Space" });
        },
        contentAfter: "<p>user@domain.com&nbsp;[]</p>",
    });
});

test.todo("should not transform url after two space", async () => {
    await testEditor({
        contentBefore: "<p>a http://test.com b http://test.com [] c http://test.com d</p>",
        stepFunction: async (editor) => {
            editor.testMode = false;
            const selection = document.getSelection();
            const anchorOffset = selection.anchorOffset;
            const p = editor.editable.querySelector("p");
            const textNode = p.childNodes[0];
            await dispatch(editor.editable, "keydown", { key: " ", code: "Space" });
            textNode.textContent = "a http://test.com b http://test.com \u00a0 c http://test.com d";
            selection.extend(textNode, anchorOffset + 1);
            selection.collapseToEnd();
            await dispatch(editor.editable, "input", { data: " ", inputType: "insertText" });
            await dispatch(editor.editable, "keyup", { key: " ", code: "Space" });
        },
        contentAfter: "<p>a http://test.com b http://test.com &nbsp;[] c http://test.com d</p>",
    });
});
