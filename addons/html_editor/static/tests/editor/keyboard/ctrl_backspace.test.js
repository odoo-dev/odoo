import { test } from "@odoo/hoot";
import { press } from "@odoo/hoot-dom";
import { testEditor } from "../../test_helpers/editor";
import { unformat } from "../../test_helpers/format";

// CTRL+BACKSPACE
test.todo("should not remove the last p with ctrl+backspace", async () => {
    await testEditor({
        contentBefore: unformat(`<p>[]<br></p>`),
        stepFunction: async (editor) => {
            editor.editable.addEventListener("keydown", (ev) => {
                // simulation of the browser default behavior
                if (ev.key === "Backspace" && ev.ctrlKey === true && !ev.defaultPrevented) {
                    const sel = document.getSelection();
                    sel.anchorNode.remove();
                }
            });
            await press(["Ctrl", "Backspace"]);
        },
        contentAfter: unformat(`<p>[]<br></p>`),
    });
});

test.todo(
    "should not remove the last p enclosed in a contenteditable=false with ctrl+backspace",
    async () => {
        await testEditor({
            contentBefore: unformat(`
                <p>text</p>
                <div contenteditable="false"><div contenteditable="true">
                    <p>[]<br></p>
                </div></div>`),
            stepFunction: async (editor) => {
                editor.editable.addEventListener("keydown", (ev) => {
                    // simulation of the browser default behavior
                    if (ev.key === "Backspace" && ev.ctrlKey === true && !ev.defaultPrevented) {
                        const sel = document.getSelection();
                        sel.anchorNode.remove();
                    }
                });
                await press(["Ctrl", "Backspace"]);
            },
            contentAfter: unformat(`
                <p>text</p>
                <div contenteditable="false"><div contenteditable="true">
                    <p>[]<br></p>
                </div></div>`),
        });
    }
);

test.todo(
    "should add a <p><br></p> element when deleting the last child of the editable with ctrl+backspace",
    async () => {
        await testEditor({
            contentBefore: unformat(`
                <blockquote>
                    []<br>
                </blockquote>`),
            stepFunction: async (editor) => {
                await press(["Ctrl", "Backspace"]);
            },
            contentAfter: unformat(`<p>[]<br></p>`),
        });
    }
);

test.todo(
    "should add a <p><br></p> element when deleting the last child of an element with ctrl+backspace",
    async () => {
        await testEditor({
            contentBefore: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <blockquote>
                        []<br>
                    </blockquote>
                </div></div>`),
            stepFunction: async (editor) => {
                await press(["Ctrl", "Backspace"]);
            },
            contentAfter: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <p>[]<br></p>
                </div></div>`),
        });
    }
);

test("should correctly rollback a CTRL+BACKSPACE if the element should not have been removed", async () => {
    await testEditor({
        contentBefore: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <blockquote class="oe_unremovable">
                        []<br>
                    </blockquote>
                </div></div>`),
        stepFunction: async (editor) => {
            await press(["Ctrl", "Backspace"]);
        },
        contentAfter: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <blockquote class="oe_unremovable">
                        []<br>
                    </blockquote>
                </div></div>`),
    });
});
