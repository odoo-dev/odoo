import { expect, test } from "@odoo/hoot";
import { contains } from "@web/../tests/web_test_helpers";
import {
    defineWebsiteModels,
    setupWebsiteBuilderWithSnippet,
} from "@website/../tests/builder/website_helpers";

defineWebsiteModels();

test("replace the custom icon of the active items", async () => {
    await setupWebsiteBuilderWithSnippet("s_accordion", { loadIframeBundles: true });
    await contains(":iframe .s_accordion .accordion-button").click();
    await contains("[data-label='Icons'] .dropdown-toggle").click();
    await contains(".o-dropdown-item:contains('Custom')").click();
    await contains("[data-label='Active'] button[data-action-id='defineCustomIcon']").click();
    await contains(".o_select_media_dialog .font-icons-icons span[data-icon='favorite']").click();
    expect(".o_select_media_dialog").toHaveCount(0);
    expect(":iframe .s_accordion .o_custom_icon_active i[data-icon='favorite']").not.toHaveCount(0);
    expect(":iframe .s_accordion .o_custom_icon_inactive i[data-icon='favorite']").toHaveCount(0);
});
