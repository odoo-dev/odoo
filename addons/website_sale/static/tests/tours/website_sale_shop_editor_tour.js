/** @odoo-module **/

import { changeOption, clickOnSave, registerWebsitePreviewTour } from '@website/js/tours/tour_utils';

registerWebsitePreviewTour("shop_editor", {
    test: true,
    url: "/shop",
    edition: true,
}, () => [{
    content: "Click on pricelist dropdown",
    trigger: ":iframe div.o_pricelist_dropdown a[data-bs-toggle=dropdown]",
    run: "click",
}, 
{
    trigger: ":iframe div.o_pricelist_dropdown a[data-bs-toggle=dropdown][aria-expanded=true]",
},
{
    trigger: ":iframe input[name=search]",
    content: "Click somewhere else in the shop.",
    run: "click",
}, 
{
    trigger: ":iframe div.o_pricelist_dropdown a[data-bs-toggle=dropdown][aria-expanded=false]",
},
{
    trigger: ":iframe div.o_pricelist_dropdown a[data-bs-toggle=dropdown]",
    content: "Click on the pricelist again.",
    run: "click",
}, {
    trigger: ":iframe div.o_pricelist_dropdown a[data-bs-toggle=dropdown][aria-expanded=true]",
    content: "Check pricelist dropdown opened",
}]);

registerWebsitePreviewTour("shop_editor_set_product_ribbon", {
    test: true,
    url: "/shop",
    edition: true,
}, () => [{
    content: "Click on first product",
    trigger: ":iframe .oe_product:first",
    run: "click",
}, {
    content: "Open the ribbon selector",
    trigger: ".o_wsale_ribbon_select we-toggler",
    run: "click",
}, {
    content: "Select a ribbon",
    trigger: '.o_wsale_ribbon_select we-button:contains("Sale")',
    run: "click",
},
...clickOnSave(),
{
    content: "Check that the ribbon was properly saved",
    trigger: ':iframe .oe_product:first .o_ribbon:contains("Sale")',
}]);

registerWebsitePreviewTour("shop_editor_set_product_template_image", {
    test: true,
    url: "/shop",
    edition: true,
}, () => [{
    content: "Click on first product image",
    trigger: ":iframe .oe_product:first img",
    run: "click",
},
changeOption("ImageTools", 'we-select:contains("Filter") we-toggler'),
changeOption("ImageTools", '[data-gl-filter="blur"]'),
{
    content: "Ensure that the image has been modified",
    trigger: ":iframe .oe_product:first img.o_modified_image_to_save",
},
...clickOnSave(),
]);
