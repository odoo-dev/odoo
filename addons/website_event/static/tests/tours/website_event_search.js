import { registry } from "@web/core/registry";
import { delay } from "@web/core/utils/concurrency";

registry.category("web_tour.tours").add("test_website_event_search", {
    steps: () => [
        {
            trigger: '.btn[title="Filter by category"]:contains(Test Category)',
            run: 'click'
        },
        {
            trigger: '.post_link:contains(tag 1)',
            expectUnloadPage: true,
            run: 'click'
        },
        {
            trigger: '.badge.bg-primary:contains(1)',
        },
        {
            trigger: '.page-link:contains(2)',
            expectUnloadPage: true,
            run: 'click'
        },
        {
            content: "Click on search input",
            trigger: ".o_searchbar_form input",
            run: "click",
        },
        {
            trigger: '#o_search_modal_events_list .input-group .search-query.form-control',
            run: 'edit Event 0',
        },
        {
            trigger: "body",
            async run() {
                await delay(2000);
            }
        },
        {
            trigger: "body",
            run: "press Escape",
        },
        {
            trigger: '.badge.bg-primary:contains(1)',
            run: () => {}
        },
    ],
});
