import { describe, test } from "@odoo/hoot";
import { waitFor } from "@odoo/hoot-dom";
import { xml } from "@odoo/owl";
import { BaseOptionComponent } from "@html_builder/core/utils";
import { addOption, defineWebsiteModels, setupWebsiteBuilder } from "./website_helpers";
import { contains, defineModels, models } from "@web/../tests/web_test_helpers";
import { useLoaderOnClick } from "@website/components/views/theme_preview_form";

class IrModuleModule extends models.Model {
    _name = "ir.module.module";

    async button_refresh_theme() {
        await new Promise((r) => setTimeout(r, 200));
        return false;
    }
}

defineWebsiteModels();
defineModels([IrModuleModule]);

describe("useLoaderOnClick", () => {
    test("Trigger website loader progress bar twice", async () => {
        addOption({
            selector: ".test-options-target",
            Component: class extends BaseOptionComponent {
                static template = xml`<div t-att-onclick="onClick()"/>`;
                setup() {
                    super.setup();
                    useLoaderOnClick();
                }

                onClick() {
                    this.env.onClickViewButton({
                        clickParams: {
                            name: "button_refresh_theme",
                        },
                        getResParams: () => ({
                            resModel: "ir.module.module",
                            resId: 42,
                        }),
                    });
                }
            },
        });
        await setupWebsiteBuilder(`
            <div class="test-options-target">a</div>
            <div class="outside-test-options-target">b</div>`);

        await contains(":iframe .test-options-target").click();

        const barWithProgressSelector =
            ".o_website_loader_progress > [role=progressbar][aria-valuenow]:not([aria-valuenow='0'])";

        // Progress bar should show some progress at some point
        await waitFor(barWithProgressSelector, { timeout: 1000 });

        // Wait for the loader to finish and disappear
        await waitFor(".o-main-components-container:not(:has(.o_website_loader_progress))", {
            timeout: 1000,
        });

        // Click outside of the options target
        await contains(":iframe .outside-test-options-target").click();

        // Refresh theme a second time
        await contains(":iframe .test-options-target").click();

        // Wait for the progress bar to show progress again
        await waitFor(barWithProgressSelector, { timeout: 1000 });
    });
});
