import { describe, test } from "@odoo/hoot";
import { dispatch } from "@odoo/hoot-dom";
import { testEditor } from "../test_helpers/editor";
import { undo } from "../test_helpers/user_actions";

describe("range collapsed", () => {
    test.todo("should ignore cutting an empty selection", async () => {
        await testEditor({
            contentBefore: "<p>[]</p>",
            stepFunction: async (editor) => {
                const clipboardData = new DataTransfer();
                dispatch(editor.editable, "cut", { clipboardData });
                // Check that nothing was set as clipboard content
                expect(clipboardData.types.length).toBe(0);
            },
        });
        await testEditor({
            contentBefore: "<p>[]</p>",
            stepFunction: async (editor) => {
                const clipboardData = new DataTransfer();
                clipboardData.setData("text/plain", "should stay");
                dispatch(editor.editable, "cut", { clipboardData });
                // Check that clipboard data was not overwritten
                expect(clipboardData.getData("text/plain")).toBe("should stay");
            },
        });
    });
});

describe("range not collapsed", () => {
    test.todo("should cut a selection as text/plain, text/html and text/odoo-editor", async () => {
        await testEditor({
            contentBefore: "<p>a[bcd]e</p>",
            stepFunction: async (editor) => {
                const clipboardData = new DataTransfer();
                dispatch(editor.editable, "cut", { clipboardData });
                expect(clipboardData.getData("text/plain")).toBe("bcd");
                expect(clipboardData.getData("text/html")).toBe("<p>bcd</p>");
                expect(clipboardData.getData("text/odoo-editor")).toBe("<p>bcd</p>");
            },
            contentAfter: "<p>a[]e</p>",
        });
        await testEditor({
            contentBefore: "<p>[abc<br>efg]</p>",
            stepFunction: async (editor) => {
                const clipboardData = new DataTransfer();
                dispatch(editor.editable, "cut", { clipboardData });
                expect(clipboardData.getData("text/plain")).toBe("abc\nefg");
                expect(clipboardData.getData("text/html")).toBe("<p>abc<br>efg</p>");
                expect(clipboardData.getData("text/odoo-editor")).toBe("<p>abc<br>efg</p>");
            },
            contentAfter: "<p>[]<br></p>",
        });
    });

    test.todo("should cut selection and register it as a history step", async () => {
        await testEditor({
            contentBefore: "<p>a[bcd]e</p>",
            stepFunction: async (editor) => {
                const historyStepsCount = editor._historySteps.length;
                dispatch(editor.editable, "cut", { clipboardData: new DataTransfer() });
                expect(editor._historySteps.length).toBe(historyStepsCount + 1);
                undo(editor);
            },
            contentAfter: "<p>a[bcd]e</p>",
        });
    });

    test.todo("should not restore cut content when cut followed by delete forward", async () => {
        await testEditor({
            contentBefore: "<p>a[]bcde</p>",
            stepFunction: async (editor) => {
                // Set selection to a[bcd]e.
                const selection = editor.document.getSelection();
                selection.extend(selection.anchorNode, 4);
                dispatch(editor.editable, "cut", { clipboardData: new DataTransfer() });
                dispatch(editor.editable, "input", {
                    inputType: "deleteContentForward",
                });
            },
            contentAfter: "<p>a[]</p>",
        });
    });
});
