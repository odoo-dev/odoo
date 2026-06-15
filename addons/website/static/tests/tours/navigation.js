import { stepUtils } from "@web_tour/tour_utils";
import { insertSnippet } from "@website/js/tours/tour_utils";
import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("website_editing_awaits_navigation", {
    steps: () => [
        {
            content: "Click on Edit right after that",
            trigger: ".o_menu_systray_item.o_edit_website_container > button",
            run: "click",
        },
        stepUtils.waitIframeIsReady(),
        {
            content: "Can insert a snippet",
            trigger: ".o-website-builder_sidebar",
        },
        ...insertSnippet({
            id: "s_banner",
            name: "Banner",
            groupName: "Intro",
        }),
        {
            content: "",
            trigger: ":iframe section.s_banner",
        },
    ],
});
