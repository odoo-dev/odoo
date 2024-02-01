import { expect, test } from "@odoo/hoot";
import { click, waitFor } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { setupEditor } from "../test_helpers/editor";
import { getContent } from "../test_helpers/selection";

test("can set foreground color", async () => {
    const { el } = await setupEditor("<p>[test]</p>");

    await waitFor(".o-we-toolbar");
    expect(".o_font_color_selector").toHaveCount(0);

    click(".o-select-color-foreground");
    await animationFrame();
    expect(".o_font_color_selector").toHaveCount(1);

    click(".o_color_button[data-color='#6BADDE']");
    await animationFrame();
    expect(".o-we-toolbar").toHaveCount(1); // toolbar still open
    expect(".o_font_color_selector").toHaveCount(0); // selector closed
    expect(getContent(el)).toBe(`<p><font style="color: rgb(107, 173, 222);">[test]</font></p>`);
});

test("can set background color", async () => {
    const { el } = await setupEditor("<p>[test]</p>");

    await waitFor(".o-we-toolbar");
    expect(".o_font_color_selector").toHaveCount(0);

    click(".o-select-color-background");
    await animationFrame();
    expect(".o_font_color_selector").toHaveCount(1);

    click(".o_color_button[data-color='#6BADDE']");
    await animationFrame();
    expect(".o-we-toolbar").toHaveCount(1); // toolbar still open
    expect(".o_font_color_selector").toHaveCount(0); // selector closed
    expect(getContent(el)).toBe(
        `<p><font style="background: rgb(107, 173, 222);">[test]</font></p>`
    );
});
