import { expect, test } from "@odoo/hoot";
import { click, hover, waitFor } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { setupEditor } from "../../test_helpers/editor";
import { getContent } from "../../test_helpers/selection";
import { unformat } from "../../test_helpers/format";

test("should only display the table ui menu if the table isContentEditable=true", async () => {
    const { el } = await setupEditor(`
        <table><tbody><tr>
            <td>11[]</td>
        </tr></tbody></table>`);
    expect(".o-we-table-menu").toHaveCount(0);

    hover(el.querySelector("td"));
    await waitFor(".o-we-table-menu");
    expect(".o-we-table-menu").toHaveCount(1);
});

test("should not display the table ui menu if the table element isContentEditable=false", async () => {
    const { el } = await setupEditor(`
        <table contenteditable="false"><tbody><tr>
            <td>11[]</td>
        </tr></tbody></table>`);
    expect(".o-we-table-menu").toHaveCount(0);

    hover(el.querySelector("td"));
    await animationFrame();
    expect(".o-we-table-menu").toHaveCount(0);
});

test.todo(
    "should display the resizeCursor if the table element isContentEditable=true",
    async () => {
        const { el } = await setupEditor(`
        <table><tbody><tr>
            <td>11[]</td>
        </tr></tbody></table>`);

        expect(".o_col_resize").toHaveCount(0);
        expect(".o_row_resize").toHaveCount(0);

        hover(el.querySelector("td"));

        // commented for now to speed up tests. need to uncomment this when resize is implemented
        // await waitFor(".o_col_resize");
        expect(".o_col_resize").toHaveCount(1);
    }
);

test("should not display the resizeCursor if the table element isContentEditable=false", async () => {
    const { el } = await setupEditor(`
        <table contenteditable="false"><tbody><tr>
            <td>11[]</td>
        </tr></tbody></table>`);

    expect(".o_col_resize").toHaveCount(0);
    expect(".o_row_resize").toHaveCount(0);

    hover(el.querySelector("td"));

    await animationFrame();
    expect(".o_col_resize").toHaveCount(0);
});

test("basic delete column operation", async () => {
    const { el } = await setupEditor(
        unformat(`
        <table><tbody><tr>
            <td>1[]</td>
            <td>2</td>
        </tr></tbody></table>`)
    );
    expect(".o-we-table-menu").toHaveCount(0);

    // hover on td to show col ui
    hover(el.querySelector("td"));
    await waitFor(".o-we-table-menu");

    // click on it to open dropdown
    click(".o-we-table-menu");
    await waitFor("div[name='delete']");

    // delete row
    click("div[name='delete']");
    expect(getContent(el)).toBe(
        unformat(`
        <table>
            <tbody>
                <tr>
                    <td>[]2</td>
                </tr>
            </tbody>
        </table>`)
    );
});
