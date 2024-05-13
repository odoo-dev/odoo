import { expect, test } from "@odoo/hoot";
import { click, waitFor } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
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

test("can shape an image", async () => {
    await setupEditor(`
        <img class="img-fluid" src="/web/static/img/logo.png">
    `);
    await click("img");
    await waitFor(".o-we-toolbar");

    click(".o-we-toolbar .fa-square");
    await animationFrame();
    expect(".o-we-toolbar .fa-square.active").toHaveCount(1);
    expect("img.rounded").toHaveCount(1);

    click(".o-we-toolbar .fa-square");
    await animationFrame();
    expect(".o-we-toolbar .fa-square.active").toHaveCount(0);
    expect("img.rounded").toHaveCount(0);

    click(".o-we-toolbar .fa-circle-o");
    await animationFrame();
    expect(".o-we-toolbar .fa-circle-o.active").toHaveCount(1);
    expect("img.rounded-circle").toHaveCount(1);

    click(".o-we-toolbar .fa-sun-o");
    await animationFrame();
    expect(".o-we-toolbar .fa-sun-o.active").toHaveCount(1);
    expect("img.shadow").toHaveCount(1);

    click(".o-we-toolbar .fa-picture-o");
    await animationFrame();
    expect(".o-we-toolbar .fa-picture-o.active").toHaveCount(1);
    expect("img.img-thumbnail").toHaveCount(1);
});

test("can undo a shape", async () => {
    const { editor } = await setupEditor(`
        <img class="img-fluid" src="/web/static/img/logo.png">
    `);
    await click("img");
    await waitFor(".o-we-toolbar");

    click(".o-we-toolbar .fa-square");
    await animationFrame();
    expect(".o-we-toolbar .fa-square.active").toHaveCount(1);
    expect("img.rounded").toHaveCount(1);
    editor.dispatch("HISTORY_UNDO");
    await animationFrame();
    expect(".o-we-toolbar .fa-square.active").toHaveCount(0);
    expect("img.rounded").toHaveCount(0);
});
