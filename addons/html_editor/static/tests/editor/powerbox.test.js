/** @odoo-module */

import { expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { setupEditor } from "../test_helpers/editor";
import { setSelection } from "@html_editor/editor/utils/selection";
import { dispatch } from "@odoo/hoot-dom";
import { getContent } from "../test_helpers/selection";
import { insertText } from "../test_helpers/user_actions";

function commandNames() {
    return [...document.querySelectorAll(".o-we-command-name")].map((c) => c.innerText);
}

function silentInsert(text) {
    const sel = window.getSelection();
    const range = sel.getRangeAt(0);
    if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
        const node = range.startContainer;
        let offset = range.startOffset;
        node.textContent =
            node.textContent.slice(0, offset) + text + node.textContent.slice(offset);
        offset += text.length;
        range.setStart(node, offset);
        range.setEnd(node, offset);
    } else {
        throw new Error("hmmm...");
    }
}

test("should open the Powerbox on type `/`", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>");
    expect(".o-we-powerbox").toHaveCount(0);
    expect(getContent(el)).toBe("<p>ab[]</p>");
    insertText(editor, "/");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(1);
});

test("should open the Powerbox on type `/`, but in an empty paragraph", async () => {
    const { el, editor } = await setupEditor("<p>[]<br></p>");
    expect(".o-we-powerbox").toHaveCount(0);
    expect(getContent(el)).toBe(
        `<p placeholder="Type "/" for commands" class="o-we-hint">[]<br></p>`
    );
    await dispatch(editor.editable, "keypress", { key: "/" });
    insertText(editor, "/");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(1);
});

test("should filter the Powerbox contents with term", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>");
    await insertText(editor, "/");
    await animationFrame();
    expect(commandNames(el).length).toBe(8);
    await insertText(editor, "head");
    await animationFrame();
    expect(commandNames(el)).toEqual(["Heading 1", "Heading 2", "Heading 3"]);
});

test("should filter the Powerbox contents with term, even after delete backward", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>");
    await insertText(editor, "/");
    await animationFrame();
    expect(commandNames(el).length).toBe(8);
    await insertText(editor, "head");
    await animationFrame();
    expect(commandNames(el)).toEqual(["Heading 1", "Heading 2", "Heading 3"]);
});

test("should not filter the powerbox contents when collaborator type on two different blocks", async () => {
    const { el, editor } = await setupEditor("<p>ab</p><p>c[]d</p>");
    await insertText(editor, "/heading");
    await animationFrame();

    // simulate a collaboration scenario: move selection, insert text, restore it
    setSelection(editor.editable.firstChild, 1);
    silentInsert("random text");
    setSelection(editor.editable.lastChild.firstChild, 9);
    expect(".o-we-powerbox").toHaveCount(1);
    await insertText(editor, "1");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(1);
    expect(commandNames(el)).toEqual(["Heading 1"]);
});

test("should execute command and remove term and hot character on Enter", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>");
    await insertText(editor, "/head");
    await animationFrame();
    expect(commandNames(el)).toEqual(["Heading 1", "Heading 2", "Heading 3"]);
    expect(".o-we-powerbox").toHaveCount(1);
    await dispatch(editor.editable, "keydown", { key: "Enter" });
    expect(getContent(el)).toBe("<h1>ab[]</h1>");
    expect(".o-we-powerbox").toHaveCount(1);
    // need 1 animation frame to close
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(0);
});

test.todo("should close the powerbox if keyup event is called on other block", async () => {
    const { editor } = await setupEditor("<p>ab</p><p>c[]d</p>");
    await insertText(editor, "/");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(1);
    await dispatch(editor.editable, "keyup");
    expect(".o-we-powerbox").toHaveCount(1);
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(0);
});
