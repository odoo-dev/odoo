import { expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { setupEditor } from "./_helpers/editor";
import { setSelection } from "@html_editor/utils/selection";
import { press } from "@odoo/hoot-dom";
import { getContent } from "./_helpers/selection";
import { insertText } from "./_helpers/user_actions";
import { Plugin } from "../src/plugin";
import { registry } from "@web/core/registry";

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

test.tags("iframe")("in iframe: should open the Powerbox on type `/`", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>", { inIFrame: true });
    expect("iframe").toHaveCount(1);
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
    press("/");
    insertText(editor, "/");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(1);
});

test("should filter the Powerbox contents with term", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>");
    insertText(editor, "/");
    await animationFrame();
    expect(commandNames(el).length).toBe(16);
    insertText(editor, "head");
    await animationFrame();
    expect(commandNames(el)).toEqual(["Heading 1", "Heading 2", "Heading 3"]);
});

test.tags("iframe")("should filter the Powerbox contents with term, in iframe", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>", { inIFrame: true });
    insertText(editor, "/");
    await animationFrame();
    expect(commandNames(el).length).toBe(16);
    insertText(editor, "head");
    await animationFrame();
    expect(commandNames(el)).toEqual(["Heading 1", "Heading 2", "Heading 3"]);
});

test("should filter the Powerbox contents with term, even after delete backward", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>");
    insertText(editor, "/");
    await animationFrame();
    expect(commandNames(el).length).toBe(16);
    insertText(editor, "head");
    await animationFrame();
    expect(commandNames(el)).toEqual(["Heading 1", "Heading 2", "Heading 3"]);
});

test("should not filter the powerbox contents when collaborator type on two different blocks", async () => {
    const { el, editor } = await setupEditor("<p>ab</p><p>c[]d</p>");
    insertText(editor, "/heading");
    await animationFrame();

    // simulate a collaboration scenario: move selection, insert text, restore it
    setSelection(editor.editable.firstChild, 1);
    silentInsert("random text");
    setSelection(editor.editable.lastChild.firstChild, 9);
    expect(".o-we-powerbox").toHaveCount(1);
    insertText(editor, "1");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(1);
    expect(commandNames(el)).toEqual(["Heading 1"]);
});

test("should execute command and remove term and hot character on Enter", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>");
    insertText(editor, "/head");
    await animationFrame();
    expect(commandNames(el)).toEqual(["Heading 1", "Heading 2", "Heading 3"]);
    expect(".o-we-powerbox").toHaveCount(1);
    press("Enter");
    expect(getContent(el)).toBe("<h1>ab[]</h1>");
    expect(".o-we-powerbox").toHaveCount(1);
    // need 1 animation frame to close
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(0);
});

test("should execute command and remove term and hot character on Tab", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>");
    insertText(editor, "/head");
    await animationFrame();
    press("Tab");
    expect(getContent(el)).toBe("<h1>ab[]</h1>");
});

test.todo("should close the powerbox if keyup event is called on other block", async () => {
    // ged: not sure i understand the goal of this test
    const { editor } = await setupEditor("<p>ab</p><p>c[]d</p>");
    insertText(editor, "/");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(1);
    // await dispatch(editor.editable, "keyup");
    expect(".o-we-powerbox").toHaveCount(1);
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(0);
});

test("should insert a 3x3 table on type `/table`", async () => {
    const { el, editor } = await setupEditor("<p>[]</p>");
    expect(getContent(el)).toBe(`<p placeholder="Type "/" for commands" class="o-we-hint">[]</p>`);

    insertText(editor, "/table");
    await animationFrame();

    press("Enter");
    await animationFrame();

    press("Enter");
    expect(getContent(el)).toBe(
        `<table class="table table-bordered o_table"><tbody><tr><td><p>[]<br></p></td><td><p><br></p></td><td><p><br></p></td></tr><tr><td><p><br></p></td><td><p><br></p></td><td><p><br></p></td></tr><tr><td><p><br></p></td><td><p><br></p></td><td><p><br></p></td></tr></tbody></table><p></p><br>`
    );
});

test.todo.tags("mobile")("should insert a 3x3 table on type `/table` in mobile view", async () => {
    const { el, editor } = await setupEditor("<p>[]<br></p>");
    insertText(editor, "/table");
    await animationFrame();
    press("Enter");
    expect(getContent(el)).toBe(
        `<table class="table table-bordered o_table"><tbody><tr><td>[]<p><br></p></td><td><p><br></p></td><td><p><br></p></td></tr><tr><td><p><br></p></td><td><p><br></p></td><td><p><br></p></td></tr><tr><td><p><br></p></td><td><p><br></p></td><td><p><br></p></td></tr></tbody></table><p><br></p>`
    );
});

test("should toggle list on empty paragraph", async () => {
    const { el, editor } = await setupEditor("<p>[]<br></p>");
    // Simulate typing "/checklist" in an empty paragraph (br gets removed)
    el.querySelector("p > br").remove();
    insertText(editor, "/checklist");
    expect(getContent(el)).toBe("<p>/checklist[]</p>");
    await animationFrame();
    expect(commandNames(el)).toEqual(["Checklist"]);
    expect(".o-we-powerbox").toHaveCount(1);
    press("Enter");
    expect(getContent(el)).toBe(
        `<ul class="o_checklist"><li placeholder="List" class="o-we-hint">[]<br></li></ul>`
    );
    // need 1 animation frame to close
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(0);
});

class NoOpPlugin extends Plugin {
    static name = "no_op";
    static resources = () => ({
        powerboxCategory: { id: "no_op", name: "No-op" },
        powerboxCommands: [
            {
                name: "No-op",
                description: "No-op",
                category: "no_op",
                fontawesome: "fa-header",
                action(dispatch) {
                    dispatch("NO_OP");
                },
            },
        ],
    });
}

test("should restore state before /command insertion when command is executed", async () => {
    const { el, editor } = await setupEditor("<p>abc[]</p>", {
        config: { Plugins: [...registry.category("phoenix_plugins").getAll(), NoOpPlugin] },
    });
    insertText(editor, "/no-op");
    expect(getContent(el)).toBe("<p>abc/no-op[]</p>");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(1);
    expect(commandNames(el)).toEqual(["No-op"]);
    press("Enter");
    expect(getContent(el)).toBe("<p>abc[]</p>");
});

test("should restore state before /command insertion when command is executed (2)", async () => {
    const { el, editor } = await setupEditor("<p>[]<br></p>", {
        config: { Plugins: [...registry.category("phoenix_plugins").getAll(), NoOpPlugin] },
    });
    expect(getContent(el)).toBe(
        `<p placeholder="Type "/" for commands" class="o-we-hint">[]<br></p>`
    );
    // @todo @phoenix: remove this once we manage inputs.
    // Simulate <br> removal by contenteditable when something is inserted
    el.querySelector("p > br").remove();
    insertText(editor, "/no-op");
    expect(getContent(el)).toBe("<p>/no-op[]</p>");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(1);
    expect(commandNames(el)).toEqual(["No-op"]);
    press("Enter");
    expect(getContent(el)).toBe(
        '<p placeholder="Type "/" for commands" class="o-we-hint">[]<br></p>'
    );
});

test("should discard /command insertion from history when command is executed", async () => {
    const { el, editor } = await setupEditor("<p>[]<br></p>");
    expect(getContent(el)).toBe(
        `<p placeholder="Type "/" for commands" class="o-we-hint">[]<br></p>`
    );
    // @todo @phoenix: remove this once we manage inputs.
    // Simulate <br> removal by contenteditable when something is inserted
    el.querySelector("p > br").remove();
    insertText(editor, "abc/heading1");
    expect(getContent(el)).toBe("<p>abc/heading1[]</p>");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(1);
    expect(commandNames(el)).toEqual(["Heading 1"]);
    press("Enter");
    expect(getContent(el)).toBe("<h1>abc[]</h1>");
    editor.dispatch("HISTORY_UNDO");
    expect(getContent(el)).toBe("<p>abc[]</p>");
    editor.dispatch("HISTORY_REDO");
    expect(getContent(el)).toBe("<h1>abc[]</h1>");
    editor.dispatch("HISTORY_UNDO");
    expect(getContent(el)).toBe("<p>abc[]</p>");
    editor.dispatch("HISTORY_UNDO");
    expect(getContent(el)).toBe("<p>ab[]</p>");
    editor.dispatch("HISTORY_UNDO");
    expect(getContent(el)).toBe("<p>a[]</p>");
    editor.dispatch("HISTORY_UNDO");
    expect(getContent(el)).toBe(
        `<p placeholder="Type "/" for commands" class="o-we-hint">[]<br></p>`
    );
});
