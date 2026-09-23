import { expect, test } from "@odoo/hoot";
import { queryAllAttributes } from "@odoo/hoot-dom";
import { contains } from "@web/../tests/web_test_helpers";
import { defineWebsiteModels, setupWebsiteBuilder } from "./website_helpers";

defineWebsiteModels();

const list = ".o_custom_css_list";

test("lists inline styles already on the element", async () => {
    await setupWebsiteBuilder(`<section class="s_test" style="padding-top: 8px;">x</section>`);
    await contains(":iframe .s_test").click();
    expect(`${list} input[name=property]`).toHaveValue("padding-top");
    expect(`${list} input[name=value]`).toHaveValue("8px");
    expect(`${list} input[type=checkbox]`).toBeChecked();
});

test("a new row applies on Enter, toggling it off removes it", async () => {
    await setupWebsiteBuilder(`<section class="s_test">x</section>`);
    await contains(":iframe .s_test").click();
    await contains(`${list} .builder_list_add_item`).click();
    await contains(`${list} input[name=property]`).edit("margin", { confirm: "enter" });
    expect(":iframe .s_test").not.toHaveAttribute("style"); // no value yet
    await contains(`${list} input[name=value]`).edit("0px", { confirm: "enter" });
    expect(":iframe .s_test").toHaveAttribute("style", "margin: 0px;");
    // Its own style must not come back as an extra "inline" row.
    expect(`${list} input[name=property]`).toHaveCount(1);

    await contains(`${list} input[type=checkbox]`).click();
    expect(":iframe .s_test").not.toHaveAttribute("style", "margin: 0px;");
    expect(`${list} input[name=property]`).toHaveValue("margin");
    expect(`${list} input[name=value]`).toHaveValue("0px");
});

test("deleting a pre-existing inline style removes it", async () => {
    await setupWebsiteBuilder(`<section class="s_test" style="padding-top: 8px;">x</section>`);
    await contains(":iframe .s_test").click();
    await contains(`${list} .builder_list_remove_item`).click();
    expect(":iframe .s_test").not.toHaveAttribute("style", "padding-top: 8px;");
});

test("joins existing panels instead of adding one per ancestor", async () => {
    await setupWebsiteBuilder(`
        <section class="s_test">
            <div class="container"><div class="row"><div class="col-lg-6"><p>x</p></div></div></div>
        </section>`);
    await contains(":iframe .s_test p").click();
    // `selector="*"` alone gave 6 panels: one per ancestor, plus the <p>.
    expect(queryAllAttributes(".options-container", "data-container-title")).toEqual([
        "Block",
        "Column",
    ]);
    // The unfolded (Column) panel has the Custom CSS list.
    expect(`.we-bg-options-container ${list}`).toHaveCount(1);
});
