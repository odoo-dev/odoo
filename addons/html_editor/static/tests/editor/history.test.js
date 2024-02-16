import { expect, describe, test } from "@odoo/hoot";
import { testEditor } from "../test_helpers/editor";
import { addStep, deleteBackward, insertText, redo, undo } from "../test_helpers/user_actions";
import { Plugin } from "../../src/editor/plugin";

describe("undo", () => {
    test("should undo a backspace", async () => {
        await testEditor({
            contentBefore: "<p>ab []cd</p>",
            stepFunction: async (editor) => {
                await deleteBackward(editor); // <p>ab[]cd</p>
                undo(editor); // <p>ab []cd</p>
            },
            contentAfter: "<p>ab []cd</p>",
        });
    });

    test("should undo a backspace, then do nothing on undo", async () => {
        await testEditor({
            contentBefore: "<p>ab []cd</p>",
            stepFunction: async (editor) => {
                await deleteBackward(editor); // <p>ab[]cd</p>
                undo(editor); // <p>ab []cd</p>
                undo(editor); // <p>ab []cd</p> (nothing to undo)
            },
            contentAfter: "<p>ab []cd</p>",
        });
    });
});

describe("redo", () => {
    test("should undo, then redo a backspace", async () => {
        await testEditor({
            contentBefore: "<p>ab []cd</p>",
            stepFunction: async (editor) => {
                await deleteBackward(editor); // <p>ab[]cd</p>
                undo(editor); // <p>ab []cd</p>
                redo(editor); // <p>ab[]cd</p>
            },
            contentAfter: "<p>ab[]cd</p>",
        });
    });

    test("should undo, then redo a backspace, then undo again to get back to the starting point", async () => {
        await testEditor({
            contentBefore: "<p>ab []cd</p>",
            stepFunction: async (editor) => {
                await deleteBackward(editor); // <p>ab[]cd</p>
                undo(editor); // <p>ab []cd</p>
                redo(editor); // <p>ab[]cd</p>
                undo(editor); // <p>ab []cd</p>
            },
            contentAfter: "<p>ab []cd</p>",
        });
    });

    test("should undo, then redo a backspace, then do nothing on redo", async () => {
        await testEditor({
            contentBefore: "<p>ab []cd</p>",
            stepFunction: async (editor) => {
                await deleteBackward(editor); // <p>ab[]cd</p>
                undo(editor); // <p>ab []cd</p>
                redo(editor); // <p>ab[]cd</p>
                redo(editor); // <p>ab[]cd</p> (nothing to redo)
            },
            contentAfter: "<p>ab[]cd</p>",
        });
    });

    test("should undo, then undo, then redo, then redo two backspaces, then do nothing on redo, then undo", async () => {
        await testEditor({
            contentBefore: "<p>ab []cd</p>",
            stepFunction: async (editor) => {
                await deleteBackward(editor); // <p>ab[]cd</p>
                await deleteBackward(editor); // <p>a[]cd</p>
                undo(editor); // <p>ab[]cd</p>
                undo(editor); // <p>ab []cd</p>
                redo(editor); // <p>ab[]cd</p>
                redo(editor); // <p>a[]cd</p>
                redo(editor); // <p>a[]cd</p> (nothing to redo)
            },
            contentAfter: "<p>a[]cd</p>",
        });
    });

    test("should 2x undo, then 2x redo, then 2x undo, then 2x redo a backspace", async () => {
        await testEditor({
            contentBefore: "<p>ab []cd</p>",
            stepFunction: async (editor) => {
                await deleteBackward(editor); // <p>ab[]cd</p>
                undo(editor); // <p>ab []cd</p>
                undo(editor); // <p>ab []cd</p> (nothing to undo)
                redo(editor); // <p>ab[]cd</p>
                redo(editor); // <p>ab[]cd</p> (nothing to redo)
                undo(editor); // <p>ab []cd</p>
                undo(editor); // <p>ab []cd</p> (nothing to undo)
                redo(editor); // <p>ab[]cd</p>
                redo(editor); // <p>ab[]cd</p> (nothing to redo)
            },
            contentAfter: "<p>ab[]cd</p>",
        });
    });

    test("should type a, b, c, undo x2, d, undo x2, redo x2", async () => {
        await testEditor({
            contentBefore: "<p>[]</p>",
            stepFunction: async (editor) => {
                await insertText(editor, "a");
                await insertText(editor, "b");
                await insertText(editor, "c");
                undo(editor);
                undo(editor);
                await insertText(editor, "d");
                undo(editor);
                undo(editor);
                redo(editor);
                redo(editor);
            },
            contentAfter: "<p>ad[]</p>",
        });
    });

    test("should type a, b, c, undo x2, d, undo, redo x2", async () => {
        await testEditor({
            contentBefore: "<p>[]</p>",
            stepFunction: async (editor) => {
                await insertText(editor, "a");
                await insertText(editor, "b");
                await insertText(editor, "c");
                undo(editor);
                undo(editor);
                await insertText(editor, "d");
                undo(editor);
                redo(editor);
                redo(editor);
            },
            contentAfter: "<p>ad[]</p>",
        });
    });
});

describe("revertCurrentStep", () => {
    test.todo("should not lose initially nested style", async () => {
        await testEditor({
            contentBefore: '<p>a[b<span style="color: tomato;">c</span>d]e</p>',
            stepFunction: async (editor) => {
                // simulate preview
                editor.historyPauseSteps();
                editor.dispatch("FORMAT_BOLD");
                editor.historyUnpauseSteps();
                // simulate preview's reset
                editor.historyRevertCurrentStep(); // back to initial state
            },
            contentAfter: '<p>a[b<span style="color: tomato;">c</span>d]e</p>',
        });
    });
});

describe("step", () => {
    test.todo('should allow insertion of nested contenteditable="true"', async () => {
        await testEditor({
            contentBefore: `<div contenteditable="false"></div>`,
            stepFunction: async (editor) => {
                const editable = '<div contenteditable="true">abc</div>';
                editor.editable.querySelector("div").innerHTML = editable;
                editor.historyStep();
            },
            contentAfter: `<div contenteditable="false"><div contenteditable="true">abc</div></div>`,
        });
    });
});

describe("prevent renderingClasses to be set from history", () => {
    class TestRenderingClassesPlugin extends Plugin {
        static name = "testRenderClasses";
        static resources = () => ({
            history_rendering_classes: ["x"],
        });
    }
    test("should prevent renderingClasses to be added", async () => {
        await testEditor({
            contentBefore: `<p>a</p>`,
            stepFunction: async (editor) => {
                const p = editor.editable.querySelector("p");
                p.className = "x";
                editor.dispatch("ADD_STEP");
                const history = editor.plugins.find((p) => p.constructor.name === "history");
                expect(history.steps.length).toBe(1);
            },
            config: { Plugins: [TestRenderingClassesPlugin] },
        });
    });

    test("should prevent renderingClasses to be added when adding 2 classes", async () => {
        await testEditor({
            contentBefore: `<p>a</p>`,
            stepFunction: async (editor) => {
                const p = editor.editable.querySelector("p");
                p.className = "x y";
                addStep(editor);
                undo(editor);
                redo(editor);
            },
            contentAfter: `[]<p class="y">a</p>`,
            config: { Plugins: [TestRenderingClassesPlugin] },
        });
    });

    test.todo("should prevent renderingClasses to be added in historyApply", async () => {
        await testEditor({
            contentBefore: `<p>a</p>`,
            stepFunction: async (editor) => {
                const p = editor.editable.querySelector("p");
                editor.historyApply([
                    {
                        attributeName: "class",
                        id: p.oid,
                        oldValue: null,
                        type: "attributes",
                        value: "x y",
                    },
                ]);
            },
            contentAfter: `<p class="y">a</p>`,
            config: { Plugins: [TestRenderingClassesPlugin] },
        });
    });

    test.todo("should skip the mutations if no changes in state", async () => {
        await testEditor({
            contentBefore: `<p class="x">a</p>`,
            stepFunction: async (editor) => {
                const p = editor.editable.querySelector("p");
                editor.historyPauseSteps();
                p.className = ""; // remove class 'x'
                p.className = "x"; // apply class 'x' again
                editor.historyUnpauseSteps();
                editor.historyRevertCurrentStep(); // back to the initial state
            },
            contentAfter: `<p class="x">a</p>`,
            config: { Plugins: [TestRenderingClassesPlugin] },
        });
    });
});
