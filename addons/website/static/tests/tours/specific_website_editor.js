import { registry } from "@web/core/registry";
import { clickOnEditAndWaitEditMode, waitForEditMode } from "@website/js/tours/tour_utils";

registry.category("web_tour.tours").add("generic_website_editor", {
    steps: () => [
        waitForEditMode,
        {
            trigger: ':iframe body:not([data-hello="world"])',
            content: "Check that the editor DOM matches its website-generic features",
        },
    ],
});

registry.category("web_tour.tours").add("specific_website_editor", {
    steps: () => [
        ...clickOnEditAndWaitEditMode(),
        {
            trigger: ':iframe body[data-hello="world"]',
            content: "Check that the editor DOM matches its website-specific features",
        },
    ],
});
