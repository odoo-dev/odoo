/** @odoo-module */

import { expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { getContent, insertText, setupEditor } from "../helpers";

function commandNames() {
    return [...document.querySelectorAll(".o-we-command-name")].map((c) => c.innerText);
}

test("should open the Powerbox on type `/`", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>");
    expect(".o-we-powerbox").toHaveCount(0);
    expect(getContent(el)).toBe("<p>ab[]</p>");
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
