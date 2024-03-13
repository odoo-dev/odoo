import { expect, test } from "@odoo/hoot";
import { click, press, queryAll, queryAllTexts, waitFor, waitForNone, waitUntil } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { contains } from "@web/../tests/web_test_helpers";
import { setupEditor } from "../test_helpers/editor";
import { unformat } from "../test_helpers/format";
import { getContent, setContent } from "../test_helpers/selection";

test("toolbar is only visible when selection is not collapsed", async () => {
    const { el } = await setupEditor("<p>test</p>");

    // set a non-collapsed selection to open toolbar
    expect(".o-we-toolbar").toHaveCount(0);
    setContent(el, "<p>[test]</p>");
    await waitFor(".o-we-toolbar");
    expect(".o-we-toolbar").toHaveCount(1);

    // set a collapsed selection to close toolbar
    setContent(el, "<p>test[]</p>");
    await waitUntil(() => !document.querySelector(".o-we-toolbar"));
    expect(".o-we-toolbar").toHaveCount(0);
});

test("toolbar works: can format bold", async () => {
    const { el } = await setupEditor("<p>test</p>");
    expect(getContent(el)).toBe("<p>test</p>");

    // set selection to open toolbar
    expect(".o-we-toolbar").toHaveCount(0);
    setContent(el, "<p>[test]</p>");
    await waitFor(".o-we-toolbar");

    // click on toggle bold
    await contains(".btn[name='bold']").click();
    expect(getContent(el)).toBe("<p><strong>[test]</strong></p>");
});

test.tags("iframe")("toolbar in an iframe works: can format bold", async () => {
    const { el } = await setupEditor("<p>test</p>", { inIFrame: true });
    expect("iframe").toHaveCount(1);
    expect(getContent(el)).toBe("<p>test</p>");

    // set selection to open toolbar
    expect(".o-we-toolbar").toHaveCount(0);
    setContent(el, "<p>[test]</p>");
    await waitFor(".o-we-toolbar");

    // click on toggle bold
    await contains(".btn[name='bold']").click();
    expect(getContent(el)).toBe("<p><strong>[test]</strong></p>");
});

test("toolbar buttons react to selection change", async () => {
    const { el } = await setupEditor("<p>test some text</p>");

    // set selection to open toolbar
    setContent(el, "<p>[test] some text</p>");
    await waitFor(".o-we-toolbar");

    // check that bold button is not active
    expect(".btn[name='bold']").not.toHaveClass("active");

    // click on toggle bold
    await contains(".btn[name='bold']").click();
    expect(getContent(el)).toBe("<p><strong>[test]</strong> some text</p>");
    expect(".btn[name='bold']").toHaveClass("active");

    // set selection where text is not bold
    setContent(el, "<p><strong>test</strong> some [text]</p>");
    await waitFor(".btn[name='bold']:not(.active)");
    expect(".btn[name='bold']").not.toHaveClass("active");

    // set selection again where text is bold
    setContent(el, "<p><strong>[test]</strong> some text</p>");
    await waitFor(".btn[name='bold'].active");
    expect(".btn[name='bold']").toHaveClass("active");
});

test("toolbar buttons react to selection change (2)", async () => {
    const { el } = await setupEditor("<p><strong>test [some]</strong> some text</p>");

    await waitFor(".o-we-toolbar");
    expect(".btn[name='bold']").toHaveClass("active");

    // extends selection to include non-bold text
    setContent(el, "<p><strong>test [some</strong> some] text</p>");
    // @todo @phoenix: investigate why waiting for animation frame is (sometimes) not enough
    await waitFor(".btn[name='bold']:not(.active)");
    expect(".btn[name='bold']").not.toHaveClass("active");

    // change selection to come back into bold text
    setContent(el, "<p><strong>test [so]me</strong> some text</p>");
    await waitFor(".btn[name='bold'].active");
    expect(".btn[name='bold']").toHaveClass("active");
});

test("toolbar list buttons react to selection change", async () => {
    const { el } = await setupEditor("<ul><li>[abc]</li></ul>");

    await waitFor(".o-we-toolbar");
    expect(".btn[name='bulleted_list']").toHaveClass("active");
    expect(".btn[name='numbered_list']").not.toHaveClass("active");
    expect(".btn[name='checklist']").not.toHaveClass("active");

    // Toggle to numbered list
    click(".btn[name='numbered_list']");
    await waitFor(".btn[name='numbered_list'].active");
    expect(getContent(el)).toBe("<ol><li>[abc]</li></ol>");
    expect(".btn[name='bulleted_list']").not.toHaveClass("active");
    expect(".btn[name='numbered_list']").toHaveClass("active");
    expect(".btn[name='checklist']").not.toHaveClass("active");

    // Toggle to checklist
    click(".btn[name='checklist']");
    await waitFor(".btn[name='checklist'].active");
    expect(getContent(el)).toBe('<ul class="o_checklist"><li>[abc]</li></ul>');
    expect(".btn[name='bulleted_list']").not.toHaveClass("active");
    expect(".btn[name='numbered_list']").not.toHaveClass("active");
    expect(".btn[name='checklist']").toHaveClass("active");

    // Toggle list off
    click(".btn[name='checklist']");
    await waitFor(".btn[name='checklist']:not(.active)");
    expect(getContent(el)).toBe("<p>[abc]</p>");
    expect(".btn[name='bulleted_list']").not.toHaveClass("active");
    expect(".btn[name='numbered_list']").not.toHaveClass("active");
    expect(".btn[name='checklist']").not.toHaveClass("active");
});

test("toolbar works: can select font", async () => {
    const { el } = await setupEditor("<p>test</p>");
    expect(getContent(el)).toBe("<p>test</p>");

    // set selection to open toolbar
    expect(".o-we-toolbar").toHaveCount(0);
    setContent(el, "<p>[test]</p>");
    await waitFor(".o-we-toolbar");
    await contains(".o-we-toolbar [name='font'] .dropdown-toggle").click();
    await contains(".o_font_selector_menu .dropdown-item:contains('Header 2')").click();
    expect(getContent(el)).toBe("<h2>[test]</h2>");
});

test("toolbar works: can select font size", async () => {
    const { el } = await setupEditor("<p>test</p>");
    expect(getContent(el)).toBe("<p>test</p>");

    // set selection to open toolbar
    expect(".o-we-toolbar").toHaveCount(0);
    setContent(el, "<p>[test]</p>");
    await waitFor(".o-we-toolbar");
    await contains(".o-we-toolbar [name='font-size'] .dropdown-toggle").click();
    const items = ["80", "72", "64", "56", "28", "21", "18", "17", "15", "14"];
    expect(queryAllTexts(".o_font_selector_menu .dropdown-item")).toEqual(items);
    await contains(".o_font_selector_menu .dropdown-item:contains('28')").click();
    expect(getContent(el)).toBe(`<p><span class="h1-fs">[test]</span></p>`);
});

test("toolbar should not open on keypress tab inside table", async () => {
    const contentBefore = unformat(`
        <table>
            <tbody>
                <tr>
                    <td><p>[]ab</p></td>
                    <td><p>cd</p></td>
                </tr>
            </tbody>
        </table>
    `);
    const contentAfter = unformat(`
        <table>
            <tbody>
                <tr>
                    <td><p>ab</p></td>
                    <td><p>cd[]</p></td>
                </tr>
            </tbody>
        </table>
    `);

    const { el } = await setupEditor(contentBefore);
    press("Tab");
    expect(getContent(el)).toBe(contentAfter);
    await animationFrame();
    expect(".o-we-toolbar").toHaveCount(0);
});

test("toolbar should close on keypress tab inside table", async () => {
    const contentBefore = unformat(`
        <table>
            <tbody>
                <tr>
                    <td><p>[ab]</p></td>
                    <td><p>cd</p></td>
                </tr>
            </tbody>
        </table>
    `);
    const contentAfter = unformat(`
        <table>
            <tbody>
                <tr>
                    <td><p>ab</p></td>
                    <td><p>cd[]</p></td>
                </tr>
            </tbody>
        </table>
    `);

    const { el } = await setupEditor(contentBefore);
    await waitFor(".o-we-toolbar");
    press("Tab");
    expect(getContent(el)).toBe(contentAfter);
    await waitForNone(".o-we-toolbar");
    expect(".o-we-toolbar").toHaveCount(0);
});

test("toolbar buttons shouldn't be active without text node in the selection", async () => {
    await setupEditor("<div>[<p><br></p>]</div>");
    await waitFor(".o-we-toolbar");
    expect(queryAll(".o-we-toolbar .btn.active").length).toBe(0);
});
