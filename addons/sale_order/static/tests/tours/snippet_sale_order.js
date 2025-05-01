import {
    registerWebsitePreviewTour,
    insertSnippet,
    clickOnSnippet,
    changeOption,
} from "@website/js/tours/tour_utils";

registerWebsitePreviewTour(
    "sale_order_snippet",
    {
        url: "/",
        edition: true,
    },
    () => [
        ...insertSnippet({
            id: "s_sale_order_items_template",
            name: "Sale Order",
            groupName: "Sale Order",
        }),
        ...clickOnSnippet({ id: "s_sale_order_items", name: "Sale Order" }),
        changeOption("SaleOrderOption", "we-select"),
        changeOption("SaleOrderOption", '[data-select-data-attribute="list"]'),
        {
            content: "Verify data-layout attribute is set to list",
            trigger: ':iframe .s_sale_order_items[data-layout="list"]',
        },
        {
            content: "Click load more button",
            trigger: ':iframe #load_more_btn',
            run: 'click',
        },
        {
            content: "Verify more sale orders are loaded",
            trigger: ':iframe .s_sale_order_items tbody tr:nth-child(11)',
        },
        changeOption("SaleOrderOption", "we-checkbox"),
        {
            content: "Verify data-confirm-orders attribute is set to true",
            trigger: ':iframe .s_sale_order_items[data-confirm-orders="true"]',
        },
    ]
);
