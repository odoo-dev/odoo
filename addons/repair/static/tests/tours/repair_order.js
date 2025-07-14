/** @odoo-module */

import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add('test_repair_without_product_in_parts', {

    steps: () => [
    {
        content: "Create a new repair order",
        trigger: '.o_list_button_add',
        run: "click",
    },
    {
        content: "Add a line",
        trigger: 'div[name=move_ids] .o_field_x2many_list_row_add a:contains("Add a line")',
        run: "click",
    },
    {
        content: "Add a product",
        trigger: 'div[name=move_ids] .o_field_widget[name="product_id"] input',
        run: "click",
    },
    {
        content: "Select a product",
        trigger:"ul.o-autocomplete--dropdown-menu li.o-autocomplete--dropdown-item.ui-menu-item > a:contains('Test Product')",
        run: "click",
    },
    {
        content: "Save the repair order",
        trigger: ".fa-cloud-upload",
        run: "click",
    },
    {
        content: "wait for save completion",
        trigger: ".o_form_readonly, .o_form_saved",
    },
    {
        content: "Click product_id field to edit",
        trigger: 'div[name="move_ids"] td[name="product_id"].o_field_cell',
        run: "click",
    },
    {
        content: "Clear the product input",
        trigger: 'div[name="move_ids"] input.o-autocomplete--input',
        run: function () {
            const input = document.querySelector('div[name="move_ids"] input.o-autocomplete--input');
            input.value = '';
            input.dispatchEvent(new Event('change', { bubbles: true }));
        },
    },
    {
        content: "Click partner field",
        trigger: 'div[name="partner_id"] input.o-autocomplete--input',
        run: "click",
    },
    {
        content: "Select partner",
        trigger: 'ul.ui-autocomplete a:contains("Test Partner")',
        run: "click",
    },
    {
        content: "Click the product field",
        trigger: 'div[name="move_ids"] input.o-autocomplete--input',
        run: "click",
    },
    {
        content: "Select a product",
        trigger:"ul.o-autocomplete--dropdown-menu li.o-autocomplete--dropdown-item.ui-menu-item > a:contains('Test Product')",
        run: "click",
    },
    {
        content: "Save the repair order",
        trigger: ".fa-cloud-upload",
        run: "click",
    },
    {
        content: "wait for save completion",
        trigger: ".o_form_readonly, .o_form_saved",
    },
]});
