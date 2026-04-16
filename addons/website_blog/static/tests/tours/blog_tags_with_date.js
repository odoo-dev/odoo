import { registry } from "@web/core/registry";

/**
 * Makes sure that blog tags should not be removed on the addition of date filter
 * and on the removal of date filter.
 */
registry.category("web_tour.tours").add("blog_tags_with_date", {
    steps: () => [
        {
            content: "Check that the sidebar is present",
            trigger: ":iframe #o_wblog_sidebar",
        },
        {
            content: "Click on 'adventure' tag",
            trigger: ":iframe #o_wblog_sidebar a:contains('adventure')",
            run: "click",
        },
        {
            content: "Check 'adventure' tag has been added",
            trigger: ":iframe #o_wblog_posts_loop span.o_filter_tag:contains('adventure')",
        },
        {
            content: "Click on 'discovery' tag",
            trigger:
                ":iframe:has(#o_wblog_posts_loop span.o_filter_tag:contains('adventure')) #o_wblog_sidebar a:contains('discovery')",
            run: "click",
        },
        {
            content: "Check 'discovery' tag has been added",
            trigger:
                ":iframe #o_wblog_posts_loop:has(.o_filter_tag:contains('adventure')):has(.o_filter_tag:contains('discovery'))",
            pause: true,
        },
        {
            content: "Select first month",
            trigger: ":iframe select[name=archive]",
            async run({ selectByIndex }) {
                const options = Array.from(this.anchor?.options ?? []);
                const firstMonthIndex = options.findIndex((option) => option.closest("optgroup"));
                if (firstMonthIndex === -1) {
                    throw new Error("Expected an option inside an optgroup in the archive select.");
                }
                await selectByIndex(firstMonthIndex, this.anchor);
            },
        },
        {
            content: "Check date filter has been added",
            trigger: ":iframe #o_wblog_posts_loop span>i.fa-calendar-o",
        },
        {
            content:
                "Check 'adventure' and 'discovery' tag is present after addition of date filter",
            trigger:
                ":iframe #o_wblog_posts_loop:has(span:contains('adventure'), span:contains('discovery'))",
        },
        {
            content: "Remove the date filter",
            trigger: ":iframe #o_wblog_posts_loop span:has(i.fa-calendar-o) a",
            run: "click",
        },
        {
            content: "Date filter should not be present",
            trigger: ":iframe #o_wblog_posts_loop span:not(:has(i.fa-calendar-o))",
        },
        {
            content:
                "Check 'adventure' and 'discovery' tag is present after removal of date filter",
            trigger:
                ":iframe #o_wblog_posts_loop:has(span:contains('adventure'), span:contains('discovery'))",
        },
    ],
});
