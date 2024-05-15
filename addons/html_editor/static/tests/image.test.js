import { expect, test } from "@odoo/hoot";
import { click, waitFor } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { setupEditor } from "./_helpers/editor";
import { contains } from "@web/../tests/web_test_helpers";

test("image can be selected", async () => {
    const { editor } = await setupEditor(`
        <img class="img-fluid" src="/web/static/img/logo.png">
    `);
    click("img");
    await waitFor(".o-we-toolbar");
    expect(".btn-group[name='image_shape']").toHaveCount(1);
    const selectionPlugin = editor.plugins.find((p) => p.constructor.name === "selection");
    expect(selectionPlugin.getSelectedNodes()[0].tagName).toBe("IMG");
});

test("can shape an image", async () => {
    await setupEditor(`
        <img class="img-fluid" src="/web/static/img/logo.png">
    `);
    click("img");
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
    click("img");
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

test("can add an image description & tooltip", async () => {
    await setupEditor(`
        <img class="img-fluid" src="/web/static/img/logo.png">
    `);
    click("img");
    await waitFor(".o-we-toolbar");

    click(".o-we-toolbar .btn-group[name='image_description'] button");
    await animationFrame();

    expect(".modal-body").toHaveCount(1);
    await contains("input[name='description']").edit("description modified");
    await contains("input[name='tooltip']").edit("tooltip modified");
    click(".modal-footer button");
    await animationFrame();
    expect("img").toHaveAttribute("alt", "description modified");
    expect("img").toHaveAttribute("title", "tooltip modified");
});

test("can edit an image description & tooltip", async () => {
    await setupEditor(`
        <img class="img-fluid test-image" src="/web/static/img/logo.png" alt="description" title="tooltip">
    `);
    click("img.test-image");
    await waitFor(".o-we-toolbar");

    click(".o-we-toolbar .btn-group[name='image_description'] button");
    await animationFrame();

    expect(".modal-body").toHaveCount(1);
    expect("input[name='description']").toHaveValue("description");
    expect("input[name='tooltip']").toHaveValue("tooltip");
    await contains("input[name='description']").edit("description modified");
    await contains("input[name='tooltip']").edit("tooltip modified");
    click(".modal-footer button");
    await animationFrame();
    expect("img").toHaveAttribute("alt", "description modified");
    expect("img").toHaveAttribute("title", "tooltip modified");
});
