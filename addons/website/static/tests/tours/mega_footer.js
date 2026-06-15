import { registry } from "@web/core/registry";
import {
    changeOptionInPopover,
    clickOnEditAndWaitEditMode,
    clickOnSave,
    clickOnSnippet,
    clickToolbarButton,
    waitForEditMode,
} from "@website/js/tours/tour_utils";

registry.category("web_tour.tours").add("mega_footer", {
    steps: () => [
        waitForEditMode,
        {
            content: "Mark the current footer (to tell when it is gone)",
            trigger: ":iframe footer",
            run() {
                this.anchor.ownerDocument
                    .querySelector("footer #footer p")
                    .classList.add("if_this_is_here_this_is_the_old_footer");
            },
        },
        ...clickOnSnippet({ id: "o_footer", name: "Footer" }),
        ...changeOptionInPopover("Footer", "Template", "Mega"),
        {
            content: "Check that the footer has been replaced",
            trigger: ":iframe footer:not(:has(.if_this_is_here_this_is_the_old_footer))",
        },
        ...clickToolbarButton(
            "copyright and company name text",
            ".o_footer_copyright span",
            "bold" // could be any edit in that span
        ),
        ...clickOnSave(),
        ...clickOnEditAndWaitEditMode(),
        {
            content: "The company name at the bottom of the footer has the new content",
            trigger: ":iframe .o_footer_copyright span strong",
        },
    ],
});
