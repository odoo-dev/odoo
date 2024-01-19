/** @odoo-module */

import { getTraversedNodes } from "@html_editor/editor/utils/selection";
import { setupEditor } from "../helpers";
import { expect, test } from "@odoo/hoot";

test("should return the anchor node of a collapsed selection", async () => {
    const { el } = await setupEditor("<div><p>a[]bc</p><div>def</div></div>");
    expect(
        getTraversedNodes(el).map((node) =>
            node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName
        )
    ).toEqual(["abc"]);
});

test("should return the nodes traversed in a cross-blocks selection", async () => {
    const { el } = await setupEditor("<div><p>a[bc</p><div>d]ef</div></div>");
    expect(
        getTraversedNodes(el).map((node) =>
            node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName
        )
    ).toEqual(["abc", "DIV", "def"]);
});

test("should return the nodes traversed in a cross-blocks selection with hybrid nesting", async () => {
    const { el } = await setupEditor("<div><section><p>a[bc</p></section><div>d]ef</div></div>");
    expect(
        getTraversedNodes(el).map((node) =>
            node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName
        )
    ).toEqual(["abc", "DIV", "def"]);
});

test("should return an image in a parent selection", async () => {
    const { el, editor } = await setupEditor(`<div id="parent-element-to-select"><img/></div>`);
    const sel = editor.document.getSelection();
    const range = editor.document.createRange();
    const parent = editor.document.querySelector("div#parent-element-to-select");
    range.setStart(parent, 0);
    range.setEnd(parent, 1);
    sel.removeAllRanges();
    sel.addRange(range);
    expect(
        getTraversedNodes(el).map((node) =>
            node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName
        )
    ).toEqual(["DIV", "IMG"]);
});
