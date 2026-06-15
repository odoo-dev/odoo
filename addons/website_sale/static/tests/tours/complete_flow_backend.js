import { clickOnSave, waitForEditMode } from "@website/js/tours/tour_utils";
import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("website_sale.enable_extra_info", {
    steps: () => [
        waitForEditMode,
        {
            content: "open customize tab",
            trigger: "[data-name='customize']",
            run: "click",
        },
        {
            trigger: ".o_builder_sidebar_open .o_customize_tab",
        },
        {
            content: "Enable Extra step",
            trigger:
                "[data-action-param='{\"views\":[\"website_sale.extra_info\"]}'] input[type='checkbox']",
            run: "click",
        },
        {
            trigger: ":iframe .o_wizard [name=step_name]:contains(extra)",
        },
        ...clickOnSave(),
    ],
});
