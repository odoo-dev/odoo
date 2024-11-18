import { setContent } from "@html_editor/../tests/_helpers/selection";
import { insertText } from "@html_editor/../tests/_helpers/user_actions";
import { expect, test } from "@odoo/hoot";
import { animationFrame, click, queryAllTexts, queryOne } from "@odoo/hoot-dom";
import { contains, onRpc } from "@web/../tests/web_test_helpers";
import { defineWebsiteModels, openSnippetsMenu, setupWebsiteBuilder } from "./helpers";

defineWebsiteModels();

test("open SnippetsMenu and discard", async () => {
    await setupWebsiteBuilder(`<h1> Homepage </h1>`);
    expect(".o_menu_systray .o-website-btn-custo-primary").toHaveCount(1);
    await openSnippetsMenu();
    expect(".o_menu_systray .o-website-btn-custo-primary").toHaveCount(0);
    await click(".o-snippets-top-actions button:contains(Discard)");
    await animationFrame();
    expect(".o_menu_systray .o-website-btn-custo-primary").toHaveCount(1);
});

test("navigate between builder tab don't fetch snippet description again", async () => {
    onRpc("render_public_asset", () => {
        expect.step("render_public_asset");
    });
    await setupWebsiteBuilder(`<h1> Homepage </h1>`);
    await openSnippetsMenu();
    expect(queryAllTexts(".o-website-snippetsmenu .o-snippets-tabs span")).toEqual([
        "BLOCKS",
        "CUSTOMIZE",
        "THEME",
    ]);
    expect(queryOne(".o-website-snippetsmenu .o-snippets-tabs span.active")).toHaveText("BLOCKS");
    expect.verifySteps(["render_public_asset"]);

    await contains(".o-website-snippetsmenu .o-snippets-tabs span:contains(THEME)").click();
    expect(queryOne(".o-website-snippetsmenu .o-snippets-tabs span.active")).toHaveText("THEME");

    await contains(".o-website-snippetsmenu .o-snippets-tabs span:contains(BLOCK)").click();
    expect(queryOne(".o-website-snippetsmenu .o-snippets-tabs span.active")).toHaveText("BLOCKS");
    expect.verifySteps([]);
});

test("undo and redo buttons", async () => {
    const { getEditor } = await setupWebsiteBuilder("<p> Text </p>");
    expect(".o_menu_systray .o-website-btn-custo-primary").toHaveCount(1);
    await openSnippetsMenu();
    const editor = getEditor();
    setContent(editor.editable, "<p> Text[] </p>");
    await insertText(editor, "a");
    expect(editor.editable).toHaveInnerHTML("<p> Texta </p>");
    await animationFrame();
    await click(".o-snippets-menu button.fa-undo");
    await animationFrame();
    expect(editor.editable).toHaveInnerHTML("<p> Text </p>");
    await click(".o-snippets-menu button.fa-repeat");
    expect(editor.editable).toHaveInnerHTML("<p> Texta </p>");
});
