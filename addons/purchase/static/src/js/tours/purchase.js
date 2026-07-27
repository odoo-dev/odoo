import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_utils";

import PurchaseAdditionalTourSteps from "@purchase/js/tours/purchase_steps";

registry.category("web_tour.tours").add("purchase_tour", {
    steps: () => [
        stepUtils.showAppsMenuItem(),
        {
            isActive: ["community"],
            trigger: '.o_app[data-menu-xmlid="purchase.menu_purchase_root"]',
            content: _t(
                "Let's try the Purchase app to manage the flow from purchase to reception and invoice control."
            ),
            tooltipPosition: "right",
            run: "click",
        },
        {
            isActive: ["enterprise"],
            trigger: '.o_app[data-menu-xmlid="purchase.menu_purchase_root"]',
            content: _t(
                "Let's try the Purchase app to manage the flow from purchase to reception and invoice control."
            ),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            trigger: ".o_purchase_order",
        },
        {
            trigger: ".o_list_button_add",
            content: _t("Let's create your first request for quotation."),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            trigger: ".o_purchase_order",
        },
        {
            trigger: ".o_field_res_partner_many2one[name='partner_id'] input",
            content: _t("Search a vendor name, or create one on the fly."),
            tooltipPosition: "bottom",
            async run(actions) {
                const input = this.anchor.querySelector("input");
                await actions.edit("Azure Interior", input || this.anchor);
            },
        },
        {
            isActive: ["auto"],
            trigger: ".ui-menu-item > a:contains('Azure Interior')",
            content: _t("Select this vendor."),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            // The vendor was created on the fly without an email address,
            // so the composer would otherwise get stuck asking for one.
            trigger: ".o_field_res_partner_many2one[name='partner_id'] .o_external_button",
            content: _t("Open the vendor to set its email address."),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            trigger: ".o_field_widget[name='email'] input",
            content: _t("Enter an email address for your vendor."),
            tooltipPosition: "bottom",
            run: "edit azure.interior@example.com",
        },
        {
            trigger: ".o_form_button_save",
            content: _t("Save the vendor."),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            trigger: ".breadcrumb-item:not(.active):last",
            content: _t("Go back to the request for quotation."),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            trigger: ".o_field_x2many_list_row_add > button",
            content: _t("Add some products or services to your quotation."),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            trigger: ".o_purchase_order",
        },
        {
            trigger: ".o_field_widget[name=product_id], .o_field_widget[name=product_template_id]",
            content: _t("Select a product, or create a new one on the fly."),
            tooltipPosition: "right",
            async run(actions) {
                const input = this.anchor.querySelector("input");
                await actions.edit("DESK0001", input || this.anchor);
            },
        },
        {
            isActive: ["auto"],
            trigger: "a:contains('DESK0001')",
            content: _t("Select this product."),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            trigger: ".oi-arrow-right", // Wait for product creation
        },
        {
            trigger: ".o_purchase_order",
        },
        {
            trigger: "div.o_field_widget[name='product_qty'] input ",
            content: _t("Indicate the product quantity you want to order."),
            tooltipPosition: "right",
            run: "edit 12.0",
        },
        {
            isActive: ["auto", "mobile"],
            trigger: ".o_statusbar_buttons .o_arrow_button_current[name='action_rfq_send']",
        },
        ...stepUtils.statusbarButtonsSteps(
            "Send RFQ",
            _t("Send the request for quotation to your vendor.")
        ),
        {
            trigger: ".modal-footer button[name='action_send_mail']",
        },
        {
            // The vendor was created on the fly without an email address,
            // so the composer asks for one before it can send.
            isActive: ["body:has(.o-mail-RecipientsInputTagsListPopover)"],
            trigger: ".o-mail-RecipientsInputTagsListPopover input",
            content: _t("Enter an email address for your vendor."),
            tooltipPosition: "bottom",
            run: "edit azure.interior@example.com",
        },
        {
            isActive: ["body:has(.o-mail-RecipientsInputTagsListPopover)"],
            trigger: ".o-mail-RecipientsInputTagsListPopover button.btn-primary",
            content: _t("Confirm the email address."),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            trigger: ".modal-footer button[name='action_send_mail']",
            content: _t("Send the request for quotation to your vendor."),
            tooltipPosition: "left",
            run: "click",
        },
        {
            trigger: ".o_purchase_order",
        },
        {
            content: _t("Select price"),
            tooltipPosition: "bottom",
            trigger: 'tbody tr.o_data_row .o_list_number[name="price_unit"]',
            run: "click",
        },
        {
            trigger: "tbody tr.o_data_row .o_list_number[name='price_unit'] input",
            content: _t(
                "Once you get the price from the vendor, you can complete the purchase order with the right price."
            ),
            tooltipPosition: "right",
            run: "edit 200.00",
        },
        {
            isActive: ["auto"],
            trigger: ".o_purchase_order",
            content: _t("Confirm the price."),
            tooltipPosition: "bottom",
            run: "click",
        },
        ...stepUtils.statusbarButtonsSteps("Confirm Order", _t("Confirm your purchase.")),
        {
            // Wait for the confirmation to be saved before the tour ends,
            // otherwise it can finish on a still-dirty form view.
            trigger: ".o_statusbar_status .o_arrow_button_current:contains('Purchase Order')",
        },
        ...new PurchaseAdditionalTourSteps()._get_purchase_stock_steps(),
    ],
});
