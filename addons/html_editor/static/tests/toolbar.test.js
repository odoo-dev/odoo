/** @odoo-module */

import { expect, test } from "@odoo/hoot";
import { getContent, setRange, setupEditor } from "./helpers";
import { waitFor } from "@odoo/hoot-dom";
import { contains } from "@web/../tests/web_test_helpers";

test("toolbar works: can format bold", async () => {
    const { el } = await setupEditor("<p>test</p>");
    expect(getContent(el)).toBe("<p>test</p>");

    // set selection to open toolbar
    expect(".o-we-toolbar").toHaveCount(0);
    setRange(el, "<p>[test]</p>");
    await waitFor(".o-we-toolbar");

    // click on toggle bold
    await contains(".btn[name='bold']").click();
    expect(getContent(el)).toBe("<p><strong>[test]</strong></p>");
});
