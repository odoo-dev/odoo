/** @odoo-module **/

import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_service/tour_utils";

registry.category("web_tour.tours").add('event_sale_with_product_configurator_tour', {
    url: '/web',
    test: true,
    steps: [stepUtils.showAppsMenuItem(), {
    trigger: '.o_app[data-menu-xmlid="sale.sale_menu_root"]',
}, {
    trigger: '.o_list_button_add',
    extra_trigger: ".o_sale_order",
}, {
    trigger: '.o_required_modifier[name=partner_id] input',
    run: 'text Tajine Saucisse',
}, {
    trigger: '.ui-menu-item > a:contains("Tajine Saucisse")',
    auto: true,
}, {
    trigger: 'a:contains("Add a product")',
}, {
    trigger: 'div[name="product_template_id"] input',
    run: 'text event (',
}, {
    trigger: 'ul.ui-autocomplete a:contains("Registration Event (TEST variants)")',
}, {
    trigger: 'tr:has(.o_sale_product_configurator_name:contains("Memorabilia")) button:has(i.fa-shopping-cart)',
}, {
    trigger: 'button:contains(Confirm)',
}, {
    trigger: '.o_input_dropdown input',
    extra_trigger: '.o_technical_modal',  // to be in the event wizard
}, {
    trigger: 'div[name="event_id"] input',
}, {
    trigger: 'ul.ui-autocomplete a:contains("TestEvent")',
    in_modal: false,
}, {
    trigger: 'div[name="event_ticket_id"] input',
    run: 'click',
}, {
    trigger: 'ul.ui-autocomplete a:contains("Kid + meal")',
    in_modal: false,
}, {
    trigger: '.o_event_sale_js_event_configurator_ok'
}, {
    trigger: 'a:contains("Add a product")',
    extra_trigger: '.o_data_row:nth-child(2)',  // wait for the optional product line
}, {
    trigger: 'div[name="product_template_id"] input',
    extra_trigger: '[name="product_template_id"] .o_dropdown_button',
    run: 'text event (',
}, {
    trigger: 'ul.ui-autocomplete a:contains("Registration Event (TEST variants)")',
}, {
    trigger: 'tr:has(.o_sale_product_configurator_name:contains("Registration Event (TEST variants)")) label:contains("Adult")',
}, {
    trigger: 'tr:has(.o_sale_product_configurator_name:contains("Registration Event (TEST variants)"))>td:nth-child(3) input',
    run: 'text 5',
}, {
    trigger: 'main.modal-body>table:nth-child(1)>tbody>tr:nth-child(2)>td>span:contains("150.00")',  // to be sure the correct variant is set
}, {
    trigger: 'button:contains(Confirm)',
}, {
    trigger: '.o_input_dropdown input',
    extra_trigger: '.o_technical_modal',
}, {
    trigger: 'div[name="event_id"] input',
}, {
    trigger: 'ul.ui-autocomplete a:contains("TestEvent")',
    in_modal: false,
}, {
    trigger: 'div[name="event_ticket_id"] input',
    run: 'click',
}, {
    trigger: 'ul.ui-autocomplete a:contains("Adult")',
    in_modal: false,
}, {
    trigger: '.o_event_sale_js_event_configurator_ok'
}, {
    trigger: 'a:contains("Add a product")',
    extra_trigger: '.o_data_row:nth-child(3)',  // wait for the adult tickets line
}, {
    trigger: 'div[name="product_template_id"] input',
    extra_trigger: '[name="product_template_id"] .o_dropdown_button',
    run: 'text event (',
}, {
    trigger: 'ul.ui-autocomplete a:contains("Registration Event (TEST variants)")',
}, {
    trigger: 'tr:has(.o_sale_product_configurator_name:contains("Registration Event (TEST variants)")) label:contains("VIP")',
}, {
    trigger: 'main.modal-body>table:nth-child(1)>tbody>tr:nth-child(2)>td>span:contains("60.00")',  // to be sure the correct variant is set
}, {
    trigger: 'button:contains(Confirm)',
}, {
    trigger: '.o_input_dropdown input',
    extra_trigger: '.o_technical_modal',
}, {
    trigger: 'div[name="event_id"] input',
}, {
    trigger: 'ul.ui-autocomplete a:contains("TestEvent")',
    in_modal: false,
}, {
    trigger: 'div[name="event_ticket_id"] input',
    run: 'click',
}, {
    trigger: 'ul.ui-autocomplete a:contains("VIP")',
    in_modal: false,
}, {
    trigger: '.o_event_sale_js_event_configurator_ok',
}, ...stepUtils.saveForm({ extra_trigger: '.o_data_row:nth-child(4)' }),
]});
