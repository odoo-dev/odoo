import { describe, expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { setupEditor } from "./_helpers/editor";
import { MAIN_PLUGINS } from "../src/plugin_sets";
import { getContent } from "./_helpers/selection";
import { Plugin } from "../src/plugin";

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

test("plugins should be notified when ranges are removed", async () => {
    let count = 0;
    class TestPlugin extends Plugin {
        static name = "test";
        static resources = (p) => ({
            onSelectionChange: () => count++,
        });
    }

    const { el } = await setupEditor("<p>a[b]</p>", {
        config: { Plugins: [...MAIN_PLUGINS, TestPlugin] },
    });
    expect(count).toBe(3);

    document.getSelection().removeAllRanges();
    await animationFrame();
    expect(count).toBe(4);
    expect(getContent(el)).toBe("<p>ab</p>");
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
