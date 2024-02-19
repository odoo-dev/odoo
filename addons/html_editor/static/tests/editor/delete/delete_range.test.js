import { test } from "@odoo/hoot";
import { testEditor } from "../../test_helpers/editor";

async function deleteRange(editor) {
    editor.dispatch("DELETE_RANGE");
}

test.todo("should delete a range inside a text node in a paragraph", async () => {
    await testEditor({
        contentBefore: "<p>a[bc]d</p>",
        stepFunction: deleteRange,
        contentAfter: "<p>a[]d</p>",
    });
});
