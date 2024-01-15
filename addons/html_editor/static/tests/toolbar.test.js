/** @odoo-module */

import { expect, test } from "@odoo/hoot";
import { getContent, setRange, setupEditor } from "./helpers";
import { waitFor, waitUntil } from "@odoo/hoot-dom";
import { contains } from "@web/../tests/web_test_helpers";

test("toolbar is only visible when selection is not collapsed", async () => {
    const { el } = await setupEditor("<p>test</p>");

    // set a non-collapsed selection to open toolbar
    expect(".o-we-toolbar").toHaveCount(0);
    setRange(el, "<p>[test]</p>");
    await waitFor(".o-we-toolbar");
    expect(".o-we-toolbar").toHaveCount(1);

    // set a collapsed selection to close toolbar
    setRange(el, "<p>test[]</p>");
    await waitUntil(() => !document.querySelector(".o-we-toolbar"));
    expect(".o-we-toolbar").toHaveCount(0);
});

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

test("toolbar buttons react to selection change", async () => {
    const { el } = await setupEditor("<p>test some text</p>");

    // set selection to open toolbar
    setRange(el, "<p>[test] some text</p>");
    await waitFor(".o-we-toolbar");

    // check that bold button is not active
    expect(".btn[name='bold']").not.toHaveClass("active");

    // click on toggle bold
    await contains(".btn[name='bold']").click();
    expect(getContent(el)).toBe("<p><strong>[test]</strong> some text</p>");
    expect(".btn[name='bold']").toHaveClass("active");

    // set selection where text is not bold
    setRange(el, "<p><strong>test</strong> some [text]</p>");
    await waitFor(".btn[name='bold']:not(.active)");
    expect(".btn[name='bold']").not.toHaveClass("active");

    // set selection again where text is bold
    setRange(el, "<p><strong>[test]</strong> some text</p>");
    await waitFor(".btn[name='bold'].active");
    expect(".btn[name='bold']").toHaveClass("active");
});
