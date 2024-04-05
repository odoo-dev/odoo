import { Plugin } from "@html_editor/plugin";
import { MAIN_PLUGINS } from "@html_editor/plugin_sets";
import { expect, test } from "@odoo/hoot";
import { click, manuallyDispatchProgrammaticEvent } from "@odoo/hoot-dom";
import { setupEditor, testEditor } from "./_helpers/editor";
import { getContent, setContent, setSelection } from "./_helpers/selection";

test("can instantiate a Editor", async () => {
    const { el, editor } = await setupEditor("<p>hel[lo] world</p>", {});
    expect(el.innerHTML).toBe(`<p>hello world</p>`);
    expect(getContent(el)).toBe(`<p>hel[lo] world</p>`);
    setContent(el, "<div>a[dddb]</div>");
    editor.dispatch("FORMAT_BOLD");
    expect(getContent(el)).toBe(`<div>a<strong>[dddb]</strong></div>`);
});

test.tags("iframe")("can instantiate a Editor in an iframe", async () => {
    const { el, editor } = await setupEditor("<p>hel[lo] world</p>", { inIFrame: true });
    expect("iframe").toHaveCount(1);
    expect(el.innerHTML).toBe(`<p>hello world</p>`);
    expect(getContent(el)).toBe(`<p>hel[lo] world</p>`);
    setContent(el, "<div>a[dddb]</div>");
    editor.dispatch("FORMAT_BOLD");
    expect(getContent(el)).toBe(`<div>a<strong>[dddb]</strong></div>`);
});

test("with an empty selector", async () => {
    const { el } = await setupEditor("<div>[]</div>", {});
    expect(el.innerHTML).toBe(
        `<div placeholder="Type &quot;/&quot; for commands" class="o-we-hint"></div>`
    );
    expect(getContent(el)).toBe(
        `<div placeholder="Type "/" for commands" class="o-we-hint">[]</div>`
    );
});

test("with a part of the selector in an empty HTMLElement", async () => {
    const { el } = await setupEditor("<div>a[bc<div>]</div></div>", {});
    expect(el.innerHTML).toBe(`<div>abc<div></div></div>`);
    expect(getContent(el)).toBe(`<div>a[bc<div>]</div></div>`);
});

test("inverse selection", async () => {
    const { el } = await setupEditor("<div>a]bc<div>[</div></div>", {});
    expect(el.innerHTML).toBe(`<div>abc<div></div></div>`);
    expect(getContent(el)).toBe(`<div>a]bc<div>[</div></div>`);
});

test("with an empty selector and a <br>", async () => {
    const { el } = await setupEditor("<p>[]<br></p>", {});
    expect(getContent(el)).toBe(
        `<p placeholder="Type "/" for commands" class="o-we-hint">[]<br></p>`
    );
});

test.todo(
    "no arrow key press or mouse click so we remove selection (contenteditable='false')",
    async () => {
        await testEditor({
            contentBefore: '[]<hr contenteditable="false">',
            contentAfter: '<hr contenteditable="false">',
        });
        await testEditor({
            contentBefore: '<hr contenteditable="false">[]',
            contentAfter: '<hr contenteditable="false">',
        });
    }
);

test("event handlers are properly cleaned up after destruction", async () => {
    let count = 0;
    class TestHandlerPlugin extends Plugin {
        static name = "test_handler";

        setup() {
            this.addDomListener(document.body, "click", () => count++);
        }
    }

    const { editor } = await setupEditor("<p></p>", {
        config: { Plugins: [...MAIN_PLUGINS, TestHandlerPlugin] },
    });
    expect(count).toBe(0);

    click(document.body);
    expect(count).toBe(1);

    editor.destroy();
    click(document.body);
    expect(count).toBe(1);
});

test("triple click outside of the Editor", async () => {
    const { el } = await setupEditor("<p>[]abc</p>", {});
    const anchorNode = el.parentElement;
    setSelection({ anchorNode, anchorOffset: 0 });
    expect(document.getSelection().anchorNode).toBe(anchorNode);

    manuallyDispatchProgrammaticEvent(el.parentElement, "click", { detail: 3 });
    expect(document.getSelection().anchorNode).toBe(anchorNode);
    expect(getContent(el)).toBe("<p>abc</p>");

    const p = el.querySelector("p");
    setSelection({ anchorNode: p, anchorOffset: 0 });
    manuallyDispatchProgrammaticEvent(p, "click", { detail: 3 });
    expect(document.getSelection().anchorNode).toBe(p.childNodes[0]);
    expect(getContent(el)).toBe("<p>[abc]</p>");
});
