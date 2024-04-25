import { test } from "@odoo/hoot";
import { press } from "@odoo/hoot-dom";
import { testEditor } from "../_helpers/editor";
import { unformat } from "../_helpers/format";

// CTRL+BACKSPACE
test("should not remove the last p with ctrl+backspace", async () => {
    await testEditor({
        contentBefore: unformat(`<p>[]<br></p>`),
        stepFunction: () => press(["Ctrl", "Backspace"]),
        contentAfter: unformat(`<p>[]<br></p>`),
    });
});

// @todo @phoenix: this test passes/fails underministically
test("should not remove the last p enclosed in a contenteditable=false with ctrl+backspace", async () => {
    await testEditor({
        contentBefore: unformat(`
                <p>text</p>
                <div contenteditable="false"><div contenteditable="true">
                    <p>[]<br></p>
                </div></div>`),
        stepFunction: () => press(["Ctrl", "Backspace"]),
        contentAfter: unformat(`
                <p>text</p>
                <div contenteditable="false"><div contenteditable="true">
                    <p>[]<br></p>
                </div></div>`),
    });
});

test("should add a <p><br></p> element when deleting the last child of the editable with ctrl+backspace", async () => {
    await testEditor({
        contentBefore: unformat(`
                <blockquote>
                    []<br>
                </blockquote>`),
        stepFunction: () => press(["Ctrl", "Backspace"]),
        contentAfter: unformat(`<p>[]<br></p>`),
    });
});

test("should add a <p><br></p> element when deleting the last child of an element with ctrl+backspace", async () => {
    await testEditor({
        contentBefore: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <blockquote>
                        []<br>
                    </blockquote>
                </div></div>`),
        stepFunction: () => press(["Ctrl", "Backspace"]),
        contentAfter: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <p>[]<br></p>
                </div></div>`),
    });
});

test("should correctly rollback a CTRL+BACKSPACE if the element should not have been removed", async () => {
    await testEditor({
        contentBefore: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <blockquote class="oe_unremovable">
                        []<br>
                    </blockquote>
                </div></div>`),
        stepFunction: () => press(["Ctrl", "Backspace"]),
        contentAfter: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <blockquote class="oe_unremovable">
                        []<br>
                    </blockquote>
                </div></div>`),
    });
});
