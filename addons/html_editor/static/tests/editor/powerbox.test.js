/** @odoo-module */

import { expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { getContent, insertText, setupEditor } from "../helpers";

test("should open the Powerbox on type `/`", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>");
    expect(".o-we-powerbox").toHaveCount(0);
    expect(getContent(el)).toBe("<p>ab[]</p>");
    insertText(editor, "/");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(1);
});
