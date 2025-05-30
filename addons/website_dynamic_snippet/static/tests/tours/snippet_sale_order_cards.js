import {
    changeOption,
    clickOnSnippet,
    insertSnippet,
    registerWebsitePreviewTour,
    clickOnEditAndWaitEditMode,
    clickOnSave,
    clickOnElement,
} from '@website/js/tours/tour_utils';

registerWebsitePreviewTour("snippet_sale_order_cards", {
    url: "/",
    edition: true,
}, () => [
    ...insertSnippet({ id: "s_sale_order_cards", name: "Sale Order Cards", groupName: "Website Sale" }),
    ...clickOnSnippet({ id: "s_sale_order_cards", name: "Sale Order Cards", groupName: "Website Sale" }),
    changeOption("sale_order_cards_options", 'we-checkbox'),
    {
        content: "Check confirmed orders option applied",
        trigger: ':iframe section[data-show-confirm-orders="true"]',
    },
    changeOption("sale_order_cards_options", 'we-select[data-attribute-name="displayType"] we-toggler'),
    changeOption("sale_order_cards_options", 'we-button[data-select-data-attribute="list"]'),
    {
        content: "Check display type list applied",
        trigger: ':iframe section[data-display-type="list"]',
    },
    changeOption("sale_order_cards_options", 'we-select[data-attribute-name="displayType"] we-toggler'),
    changeOption("sale_order_cards_options", 'we-button[data-select-data-attribute="card"]'),
    {
        content: "Check display type card applied",
        trigger: ':iframe section[data-display-type="card"]',
    },
    {
        content: "Change number of orders option",
        trigger: 'we-input[data-attribute-name="noOfOrders"] input',
        run: `edit 15 && click body`,
    },
    {
        content: "Check number of orders option applied",
        trigger: ':iframe section[data-no-of-orders="15"]',
    },
    ...clickOnSave(),
    {
        content: "Check for load more button",
        trigger: ':iframe button[id="load_more_orders"]',
        run: `click`,
    },
    {
        content: "Check for load more button applied",
        trigger: ":iframe #sale_order_cards_container",
        run: function () {
            return this.anchor.childElementCount === 30;
        },
    },
]);
