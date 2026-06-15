import { registry } from "@web/core/registry";
import { clickOnSave, insertSnippet, waitForEditMode } from "@website/js/tours/tour_utils";

registry.category("web_tour.tours").add("snippet_version_1", {
    steps: () => [
        waitForEditMode,
        ...insertSnippet({
            id: "s_test_snip",
            name: "Test snip",
            groupName: "Content",
        }),
        ...insertSnippet({
            id: "s_text_image",
            name: "Text - Image",
            groupName: "Content",
        }),
        {
            content: "Test t-snippet and t-snippet-call: snippets have data-snippet set",
            trigger: ".o-snippets-menu .o_snippets_container_body > .o_snippet",
            run: function () {
                // Tests done here as all these are not visible on the page
                const draggableSnippets = [
                    ...document.querySelectorAll(
                        ".o-snippets-menu .o_snippets_container_body > .o_snippet:not([data-module-id]) > :nth-child(2)"
                    ),
                ];
                if (
                    draggableSnippets.length &&
                    !draggableSnippets.every((el) => el.dataset.snippet)
                ) {
                    console.error(
                        "error Some t-snippet are missing their template name or there are no snippets to drop"
                    );
                }
                if (
                    !document
                        .querySelector("iframe:not(.o_ignore_in_tour)")
                        .contentDocument.querySelector(
                            '#wrap [data-snippet="s_test_snip"] [data-snippet="s_share"]'
                        )
                ) {
                    console.error(
                        "error Dropped a s_test_snip snippet but missing s_share template name in it"
                    );
                }
            },
        },
        ...clickOnSave(),
    ],
});
