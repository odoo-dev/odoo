import { describe, test, expect } from "@odoo/hoot";
import { testEditor } from "../test_helpers/editor";

describe("isDomSelectionInEditable", () => {
    test("isDomSelectionInEditable should be true", async () => {
        await testEditor({
            contentBefore: "<p>a[]b</p>",
            stepFunction: (editor) => {
                const selection = editor.shared.getEditableSelection();
                expect(selection.isDomSelectionInEditable()).toBe(true);
            },
            contentAfter: "<p>a[]b</p>",
        });
    });
    test("isDomSelectionInEditable should be false when it is set outside the editable", async () => {
        await testEditor({
            contentBefore: "<p>a[]b</p>",
            stepFunction: (editor) => {
                const selection = document.getSelection();
                selection.setPosition(document.body);
                const editableSelection = editor.shared.getEditableSelection();
                expect(editableSelection.isDomSelectionInEditable()).toBe(false);
            },
            contentAfter: "<p>ab</p>",
        });
    });
    test("isDomSelectionInEditable should be false when it is set outside the editable after retrieving it", async () => {
        await testEditor({
            contentBefore: "<p>a[]b</p>",
            stepFunction: (editor) => {
                const selection = document.getSelection();
                const editableSelection = editor.shared.getEditableSelection();
                selection.setPosition(document.body);
                expect(editableSelection.isDomSelectionInEditable()).toBe(false);
            },
            contentAfter: "<p>ab</p>",
        });
    });
});
