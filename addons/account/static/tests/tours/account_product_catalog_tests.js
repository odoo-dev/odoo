import { accountTourSteps } from "@account/js/tours/account";
import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add('search_read_tour', {
    url: "/odoo/customer-invoices/new",
    steps: () => [
    {
        content: "Click Catalog Button",
        trigger: 'button[name=action_add_from_catalog]',
        run: "click",
    },
    {
        content: "Add a Product",
        trigger: '.o_product_kanban_catalog_view .o_kanban_record:has(span:contains("Large Cabinet")) .o_product_catalog_buttons .fa-shopping-cart',
        run: "click",
    },
    {
        content: "Back to Invoice",
        trigger: '.o-kanban-button-back',
        run: "click",
    },
    {
        content: "Check valid Product",
        trigger: '.o_field_product_label_section_and_note_cell span:contains("Large Cabinet")',
    },
]});
