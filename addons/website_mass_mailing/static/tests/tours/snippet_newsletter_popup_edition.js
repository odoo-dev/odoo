import { registry } from "@web/core/registry";
import {
    clickOnSave,
    insertSnippet,
    waitForEditMode,
} from "@website/js/tours/tour_utils";

registry.category("web_tour.tours").add("snippet_newsletter_popup_edition", {
    steps: () => [
        waitForEditMode,
        ...insertSnippet({
            id: "s_newsletter_subscribe_popup",
            name: "Newsletter Popup",
            groupName: "Contact & Forms",
        }),
        {
            content: "Check the modal is opened for edition",
            trigger: ":iframe .o_newsletter_popup .modal:visible",
        },
        ...clickOnSave(),
        {
            content: "Check the modal has been saved, closed",
            trigger: ":iframe body:has(.o_newsletter_popup:not(:visible) .modal)",
        },
    ],
});
