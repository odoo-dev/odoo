import { expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { setupEditor } from "../_helpers/editor";
import { getContent } from "../_helpers/selection";
import { insertText } from "../_helpers/user_actions";
import { unformat } from "../_helpers/format";
import { press, waitFor } from "@odoo/hoot-dom";

test("can add a table using the powerbox and keyboard", async () => {
    const { el, editor } = await setupEditor("<p>a[]</p>");
    expect(".o-we-powerbox").toHaveCount(0);
    expect(getContent(el)).toBe(`<p>a[]</p>`);

    // open powerbox
    insertText(editor, "/");
    await waitFor(".o-we-powerbox");
    expect(".o-we-tablepicker").toHaveCount(0);

    // filter to get table command in first position
    insertText(editor, "table");
    await animationFrame();

    // press enter to open tablepicker
    press("Enter");
    await waitFor(".o-we-tablepicker");
    expect(".o-we-powerbox").toHaveCount(0);

    // press enter to validate current dimension (3x3)
    press("Enter");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(0);
    expect(".o-we-tablepicker").toHaveCount(0);
    expect(getContent(el)).toBe(
        unformat(`
        <p>a</p>
        <table class="table table-bordered o_table">
            <tbody>
                <tr>
                    <td><p placeholder="Type "/" for commands" class="o-we-hint">[]<br></p></td>
                    <td><p><br></p></td>
                    <td><p><br></p></td>
                </tr>
                <tr>
                    <td><p><br></p></td>
                    <td><p><br></p></td>
                    <td><p><br></p></td>
                </tr>
                <tr>
                    <td><p><br></p></td>
                    <td><p><br></p></td>
                    <td><p><br></p></td>
                </tr>
            </tbody>
        </table>
        <p></p>
    `)
    );
});

test.tags("iframe")("in iframe, can add a table using the powerbox and keyboard", async () => {
    const { el, editor } = await setupEditor("<p>a[]</p>", {
        inIFrame: true,
    });
    expect(".o-we-powerbox").toHaveCount(0);
    expect(getContent(el)).toBe(`<p>a[]</p>`);
    expect(":iframe .o_table").toHaveCount(0);

    // open powerbox
    insertText(editor, "/");
    await waitFor(".o-we-powerbox");
    expect(".o-we-tablepicker").toHaveCount(0);

    // filter to get table command in first position
    insertText(editor, "table");
    await animationFrame();

    // press enter to open tablepicker
    press("Enter");
    await waitFor(".o-we-tablepicker");
    expect(".o-we-powerbox").toHaveCount(0);

    // press enter to validate current dimension (3x3)
    press("Enter");
    await animationFrame();
    expect(".o-we-powerbox").toHaveCount(0);
    expect(".o-we-tablepicker").toHaveCount(0);
    expect(":iframe .o_table").toHaveCount(1);
});
