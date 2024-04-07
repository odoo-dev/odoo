import { describe, expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { setupEditor } from "./_helpers/editor";

test("getEditableSelection should work, even if getSelection returns null", async () => {
    const { editor } = await setupEditor("<p>a[b]</p>");
    let selection = editor.shared.getEditableSelection();
    expect(selection.startOffset).toBe(1);
    expect(selection.endOffset).toBe(2);

    // it happens sometimes in firefox that the selection is null
    patchWithCleanup(document, {
        getSelection: () => null,
    });

    selection = editor.shared.getEditableSelection();
    expect(selection.startOffset).toBe(1);
    expect(selection.endOffset).toBe(2);
});

describe("inEditable", () => {
    test("inEditable should be true", async () => {
        const { editor } = await setupEditor("<p>a[]b</p>");
        const selection = editor.shared.getEditableSelection();
        expect(selection.inEditable).toBe(true);
    });

    test("inEditable should be false when it is set outside the editable", async () => {
        const { editor } = await setupEditor("<p>ab</p>");
        const selection = editor.shared.getEditableSelection();
        expect(selection.inEditable).toBe(false);
    });

    test("inEditable should be false when it is set outside the editable after retrieving it", async () => {
        const { editor } = await setupEditor("<p>ab[]</p>");
        const selection = document.getSelection();
        let editableSelection = editor.shared.getEditableSelection();
        selection.setPosition(document.body);
        expect(editableSelection.inEditable).toBe(true);
        // internal value is updated only after selectionchange event
        await animationFrame();
        editableSelection = editor.shared.getEditableSelection();
        expect(editableSelection.inEditable).toBe(false);
    });
});
