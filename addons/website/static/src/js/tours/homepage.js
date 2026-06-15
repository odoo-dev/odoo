import {
    changeBackgroundColor,
    clickOnEditAndWaitEditMode,
    clickOnSave,
    clickOnSnippet,
    clickOnText,
    goBackToBlocks,
    goToTheme,
    insertSnippet,
} from "@website/js/tours/tour_utils";
import { registry } from "@web/core/registry";

const snippets = [
    {
        id: "s_banner",
        name: "Banner",
        groupName: "Intro",
    },
    {
        id: "s_three_columns",
        name: "Columns",
        groupName: "Columns",
    },
    {
        id: "s_text_image",
        name: "Image - Text",
        groupName: "Content",
    },
    {
        id: "s_masonry_block_default_template",
        name: "Masonry",
        groupName: "Images",
    },
    {
        id: "s_title",
        name: "Title",
        groupName: "Text",
    },
    {
        id: "s_showcase",
        name: "Showcase",
        groupName: "Content",
    },
    {
        id: "s_call_to_action",
        name: "Call to Action",
        groupName: "Content",
    },
    {
        id: "s_quotes_carousel",
        name: "Quotes",
        groupName: "People",
    },
];

registry.category("web_tour.tours").add("homepage", {
    steps: () => [
        ...clickOnEditAndWaitEditMode(),
        ...insertSnippet(snippets[0], { position: "top" }),
        ...clickOnText(snippets[0], "h1"),
        goBackToBlocks(),
        ...insertSnippet(snippets[1]),
        ...insertSnippet(snippets[2]),
        ...clickOnSnippet(snippets[2], "top"),
        changeBackgroundColor(),
        goBackToBlocks(),
        ...insertSnippet(snippets[3]),
        ...insertSnippet(snippets[4], { position: "top" }),
        ...insertSnippet(snippets[5]),
        ...insertSnippet(snippets[6]),
        ...insertSnippet(snippets[7]),
        ...goToTheme(),
        ...clickOnSave(),
    ],
});
