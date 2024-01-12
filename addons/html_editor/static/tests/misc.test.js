/** @odoo-module */

import { expect, test } from "@odoo/hoot";
import { getContent, setupEditor } from "./helpers";

test("can instantiate a Editor", async () => {
    const { el, editor } = await setupEditor("hel[lo] world", {});
    expect(el.innerHTML).toBe("hello world");
    expect(getContent(el)).toBe(`hel[lo] world`);
    // setSelection("<div>a[dddb]</div>");
    editor.dispatch("TOGGLE_BOLD");
    expect(getContent(el)).toBe(`hel<strong>[]lo</strong> world`);
});

test("with an empty selector", async () => {
    const { el } = await setupEditor("<div>[]</div>", {});
    expect(el.innerHTML).toBe(
        `<div class="o-we-hint" placeholder="Type &quot;/&quot; for commands"></div>`
    );
    expect(getContent(el)).toBe(
        `<div class="o-we-hint" placeholder="Type "/" for commands">[]</div>`
    );
});

test("with a part of the selector in an empty HTMLElement", async () => {
    const { el } = await setupEditor("a[bc<div>]</div>", {});
    expect(el.innerHTML).toBe(`abc<div></div>`);
    expect(getContent(el)).toBe(`a[bc<div>]</div>`);
});

// const fixture = getFixture();
// const testEditor = await mountWithCleanup(TestEditor, {
//     props: { innerHTML: "hello" }
// });
// expect(fixture.innerHTML).toBe('sss');

/**
 * To write:
 *
 * EDITOR TESTS
 *
 * (make sure editor is destroyed at end of test)
 *
 * - check el is no content editable, attach editor to el, check that it is
 * - create editor, add listener on CONTENT_UPDATE, attach el, modify el content,
 *   check that listener is called (html change and text node change)
 * - same as above, but add listener after attaching el
 * - create editor, attach el, create range in el, dispatch('SET_BOLD'),
 *   check that range is bold
 *
 * USE_EDITOR TESTS
 *
 * - useEditor on ref, check that ref is content editable
 * - useEditor on ref with initialHtml => check that it is properly set (as html!)
 *
 *- USE_WYSIWYG TESTS
 */

// import { expect, test, after } from "@odoo/hoot";
// import { Editor } from "@html_editor/editor/editor";
// import { getFixture } from "@odoo/hoot/helpers";

// function prepare(str) {
//     const fixture = getFixture();
//     fixture.innerHTML = str;
//     const editor = new Editor(fixture);
//     after(() => editor.destroy());
//     return { fixture, editor };
// }

// test("setting bold on a text node", () => {
//     const { editor, fixture } = prepare("some text");
//     const r = new Range();
//     r.setStart(fixture.firstChild, 2);
//     r.setEnd(fixture.firstChild, 4);
//     editor.setBold(r);
//     expect(fixture.innerHTML).toBe("so<strong>me</strong> text");
// });
