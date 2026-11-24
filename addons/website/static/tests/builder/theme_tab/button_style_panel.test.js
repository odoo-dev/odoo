import { expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-dom";
import {
    defineWebsiteModels,
    setupWebsiteBuilder,
} from "@website/../tests/builder/website_helpers";
import {
    contains,
    defineModels,
    models,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { ThemeTabPlugin } from "@website/builder/plugins/theme/theme_tab_plugin";

defineWebsiteModels();

const panel = ".o_hb_sliding_panel:not(.d-none)";

test("primary and secondary button styles open in a sliding panel", async () => {
    await setupWebsiteBuilder("");
    await contains(".o_hb_snippets_tabs button[data-name=theme]").click();
    await animationFrame();
    expect(".o_hb_tab_content button[data-icon=brush]").toHaveCount(2);

    await contains(".o_hb_tab_content button[data-icon=brush]:eq(0)").click();
    await animationFrame();
    expect(".o_hb_sliding_panel:not(.d-none) .o_hb_sliding_panel_label").toHaveText(
        /Primary Style/
    );
    const rows = ["Style", "Font Family", "Padding", "Font Size", "Font Weight", "Round Corners"];
    for (const label of rows) {
        // Exact text: "Style" would also match "Text Style".
        expect(`${panel} .o_hb_row_label:text(${label})`).toHaveCount(1);
    }
});

test("hover effect select sets the btn-hover-effect variable", async () => {
    class WebsiteAssets extends models.Model {
        _name = "website.assets";
        make_scss_customization(location, changes) {
            expect.step(JSON.stringify(changes));
        }
    }
    defineModels([WebsiteAssets]);
    onRpc("/website/theme_customize_bundle_reload", () => ({}));
    await setupWebsiteBuilder("");
    await contains(".o_hb_snippets_tabs button[data-name=theme]").click();
    await animationFrame();
    for (const value of ["none", "lighter", "lift", "darken"]) {
        await contains(".o_hb_row:has([data-tooltip='Effect apply on all buttons']) .o-dropdown").click();
        await contains(`.o_popover [data-action-value='${value}']`).click();
        await animationFrame();
    }
    expect.verifySteps([
        '{"btn-hover-effect":"none"}',
        '{"btn-hover-effect":"lighter"}',
        '{"btn-hover-effect":"lift"}',
        '{"btn-hover-effect":"darken"}',
    ]);
});

function defineScssCustomizationSteps() {
    class WebsiteAssets extends models.Model {
        _name = "website.assets";
        make_scss_customization(location, changes) {
            expect.step(JSON.stringify(changes));
        }
    }
    defineModels([WebsiteAssets]);
    onRpc("/website/theme_customize_bundle_reload", () => ({}));
}

async function openStylePanel(index) {
    await contains(".o_hb_snippets_tabs button[data-name=theme]").click();
    await animationFrame();
    await contains(`.o_hb_tab_content button[data-icon=brush]:eq(${index})`).click();
    await animationFrame();
}

test("padding rows set the primary style's variables", async () => {
    defineScssCustomizationSteps();
    await setupWebsiteBuilder("");
    await openStylePanel(0);
    await contains(`${panel} [data-action-param='btn-primary-padding'] input`).fill("10");
    await expect.waitForSteps(['{"btn-primary-padding":"0.625rem"}']);
    await contains(`${panel} .o_hb_row_label:contains(Padding)`).click();
    await contains(`${panel} [data-action-param='btn-primary-padding-lg'] input`).fill("48");
    await expect.waitForSteps(['{"btn-primary-padding-lg":"3rem"}']);
});

test("font size rows set the secondary style's variables", async () => {
    defineScssCustomizationSteps();
    await setupWebsiteBuilder("");
    await openStylePanel(1);
    await contains(`${panel} [data-action-param='btn-secondary-font-size'] input`).fill("18");
    await expect.waitForSteps(['{"btn-secondary-font-size":"1.125rem"}']);
    await contains(`${panel} .o_hb_row_label:contains(Font Size)`).click();
    await contains(`${panel} [data-action-param='btn-secondary-font-size-sm'] input`).fill("12");
    await expect.waitForSteps(['{"btn-secondary-font-size-sm":"0.75rem"}']);
});

test("round corners rows set the primary style's variables", async () => {
    defineScssCustomizationSteps();
    await setupWebsiteBuilder("");
    await openStylePanel(0);
    await contains(`${panel} [data-action-param='btn-primary-border-radius'] input`).fill("8");
    await expect.waitForSteps(['{"btn-primary-border-radius":"0.5rem"}']);
    await contains(`${panel} .o_hb_row_label:contains(Round Corners)`).click();
    await contains(`${panel} [data-action-param='btn-primary-border-radius-lg'] input`).fill("4");
    await expect.waitForSteps(['{"btn-primary-border-radius-lg":"0.25rem"}']);
});

test("font weight row sets the secondary style's variables", async () => {
    defineScssCustomizationSteps();
    patchWithCleanup(ThemeTabPlugin.prototype, {
        async fetchFontWeights() {
            return [
                { value: 400, label: "Regular" },
                { value: 700, label: "Bold" },
            ];
        },
    });
    await setupWebsiteBuilder("");
    await openStylePanel(1);
    await contains(`${panel} .o_hb_row:contains(Font Weight) .o-dropdown:eq(0)`).click();
    await contains(".o_popover [data-action-value='700']").click();
    await expect.waitForSteps(['{"btn-secondary-font-weight":"700"}']);
});

test("font family row sets the primary style's font", async () => {
    defineScssCustomizationSteps();
    await setupWebsiteBuilder("", {
        styleContent: `:root {
            --number-of-fonts: 2;
            --font-number-1: 'Inter';
            --font-number-2: 'Roboto';
            --buttons-primary-font: 'Inter';
        }`,
    });
    await openStylePanel(0);
    await contains(`${panel} .o_hb_row:contains(Font Family) .o-dropdown`).click();
    await contains(".o_popover .o-dropdown-item:contains(Roboto)").click();
    await expect.waitForSteps([
        JSON.stringify({
            "buttons-primary-font": "'Roboto'",
            "btn-primary-font-weight": "null",
            "btn-primary-font-weight-bold": "null",
        }),
    ]);
});
