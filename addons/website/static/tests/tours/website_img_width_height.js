import {
    clickOnSave,
    insertSnippet,
    registerWebsitePreviewTour,
} from "@website/js/tours/tour_utils";

registerWebsitePreviewTour(
    "website_img_width_height",
    {
        edition: true,
    },
    () => [
        ...insertSnippet({
            id: "s_masonry_block_default_template",
            name: "Masonry",
            groupName: "Images",
        }),
        ...clickOnSave(),
        {
            content: "Check that the image width and height are set correctly",
            trigger: ":iframe .s_masonry_block img[width='800'][height='800']",
        },
    ]
);
