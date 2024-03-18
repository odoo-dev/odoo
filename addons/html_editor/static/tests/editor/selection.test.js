import { describe, test, expect } from "@odoo/hoot";
import { setupEditor } from "../test_helpers/editor";
import { animationFrame } from "@odoo/hoot-mock";

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
