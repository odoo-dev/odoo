import { goToTheme, waitForEditMode } from "@website/js/tours/tour_utils";
import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("website_snippets_menu_tabs", {
    steps: () => [
        waitForEditMode,
        ...goToTheme(),
        {
            trigger: "div[data-container-title='Website'] div.we-bg-options-container",
        },
        {
            content: "Click on the empty 'Drag blocks here' area.",
            trigger: ":iframe main > .oe_structure.oe_empty",
            run: "click",
        },
        ...goToTheme(),
        {
            content: "Verify that the customize panel is not empty.",
            trigger: ".o_theme_tab .options-container",
        },
        {
            content: "Click on the style tab.",
            trigger: "button[data-name='customize']",
            run: "click",
        },
        ...goToTheme(),
        {
            content: "Verify that the customize panel is not empty.",
            trigger: ".o_theme_tab .options-container",
        },
    ],
});
