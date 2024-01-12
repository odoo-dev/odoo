/** @odoo-module */

import { expect, test } from "@odoo/hoot";
import { getContent, setupEditor } from "../helpers";

/**
 * content of the "init" sub suite in editor.test.js
 */

test("should transform root <br> into <p>", async () => {
    const { el } = await setupEditor("ab<br>c");
    expect(getContent(el)).toBe(`<p style="margin-bottom: 0px;">ab</p><p style="margin-bottom: 0px;">c</p>`);
});

