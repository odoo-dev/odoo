/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_service/tour_utils";

import PurchaseAdditionalTourSteps from "@purchase/js/tours/purchase_steps";

registry.category("web_tour.tours").add("purchase_tour", {
    url: "/web",
    sequence: 40,
    steps: () => [
        stepUtils.showAppsMenuItem(),
        {
            trigger: '.o_app[data-menu-xmlid="purchase.menu_purchase_root"]',
            content: _t(
                "Let's try the Purchase app to manage the flow from purchase to reception and invoice control."
            ),
            position: "right",
            edition: "community",
        },
        {
            trigger: '.o_app[data-menu-xmlid="purchase.menu_purchase_root"]',
            content: _t(
                "Let's try the Purchase app to manage the flow from purchase to reception and invoice control."
            ),
            position: "bottom",
            edition: "enterprise",
        },
        {
            trigger: ".o_list_button_add",
            extra_trigger: ".o_purchase_order",
            content: _t("Let's create your first request for quotation."),
            position: "bottom",
        },
        {
            trigger: ".o_form_editable .o_field_many2one[name='partner_id']",
            extra_trigger: ".o_purchase_order",
            content: _t("Search a vendor name, or create one on the fly."),
            position: "bottom",
            run: function (actions) {
                actions.text("Agrolait", this.anchor.querySelector("input"));
            },
        },
        {
            trigger: ".ui-menu-item > a",
            auto: true,
            in_modal: false,
        },
        {
            trigger: ".o_field_x2many_list_row_add > a",
            extra_trigger: ".o_field_many2one[name='partner_id'] .o_external_button",
            content: _t("Add some products or services to your quotation."),
            position: "bottom",
        },
        {
            trigger: ".o_field_widget[name=product_id], .o_field_widget[name=product_template_id]",
            extra_trigger: ".o_purchase_order",
            content: _t("Select a product, or create a new one on the fly."),
            position: "right",
            run: function (actions) {
                const input = this.anchor.querySelector("input");
                actions.text("DESK0001", input.length === 0 ? this.anchor : input);
                const descriptionElement = document.querySelector(
                    '.o_form_editable textarea[name="name"]'
                );
                // when description changes, we know the product has been created
                descriptionElement.addEventListener("change", () => {
                    descriptionElement.classList.add("product_creation_success");
                });
            },
        },
        {
            trigger: '.ui-menu.ui-widget .ui-menu-item a:contains("DESK0001")',
            auto: true,
        },
        {
            trigger: '.o_form_editable textarea[name="name"].product_creation_success',
            auto: true,
            run: function () {}, // wait for product creation
        },
        {
            trigger: ".o_form_editable input[name='product_qty'] ",
            extra_trigger: ".o_purchase_order",
            content: _t("Indicate the product quantity you want to order."),
            position: "right",
            run: "text 12.0",
        },
        ...stepUtils.statusbarButtonsSteps(
            "Send by Email",
            _t("Send the request for quotation to your vendor."),
            ".o_statusbar_buttons .o_arrow_button_current[name='action_rfq_send']"
        ),
        {
            trigger: ".modal-content",
            auto: true,
            run: function (actions) {
                // Check in case user must add email to vendor
                var input = document.querySelector(".modal-content input[name='email']");
                if (input.length) {
                    actions.text("agrolait@example.com", ".modal-content input[name='email']");
                    actions.click(".modal-footer button");
                }
            },
        },
        {
            trigger: ".modal-footer button[name='action_send_mail']",
            extra_trigger: ".modal-footer button[name='action_send_mail']",
            content: _t("Send the request for quotation to your vendor."),
            position: "left",
            run: "click",
        },
        {
            trigger: ".o_field_widget [name=price_unit]",
            extra_trigger: ".o_purchase_order",
            content: _t(
                "Once you get the price from the vendor, you can complete the purchase order with the right price."
            ),
            position: "right",
            run: "text 200.00",
        },
        {
            auto: true,
            trigger: ".o_purchase_order",
            run: "click",
        },
        ...stepUtils.statusbarButtonsSteps("Confirm Order", _t("Confirm your purchase.")),
        ...new PurchaseAdditionalTourSteps()._get_purchase_stock_steps(),
    ],
});
