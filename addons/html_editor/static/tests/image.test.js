import { expect, test } from "@odoo/hoot";
import { click, waitFor } from "@odoo/hoot-dom";
import { setupEditor } from "./_helpers/editor";

test("image can be selected", async () => {
    const { editor } = await setupEditor(`
        <img class="img-fluid" src="/web/static/img/logo.png">
    `);
    await click("img");
    await waitFor(".o-we-toolbar");
    expect(".btn-group[name='image_shape']").toHaveCount(1);
    const selectionPlugin = editor.plugins.find((p) => p.constructor.name === "selection");
    expect(selectionPlugin.getSelectedNodes()[0].tagName).toBe("IMG");
});
