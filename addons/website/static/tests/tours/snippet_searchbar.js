import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("searchbar_in_translated_website", {
    steps: () => [
        {
            content: "Wait for the page to load with the french locale.",
            trigger: "html[lang*='fr']",
        },
        {
            content: "Click the search button to open the search dialog.",
            trigger: ".o_searchbar_form a.o_search_btn",
            run: "click",
        },
        {
            content: "Verify the search dialog is opened.",
            trigger: "#o_search_modal .o_searchbar_form",
        },
    ],
});
