import { markup } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_utils";
import { showProductColumn } from "@account/js/tours/tour_utils";

registry.category("web_tour.tours").add("sale_tour", {
    steps: () => [
        stepUtils.showAppsMenuItem(),
        {
            isActive: ["community"],
            trigger: ".o_app[data-menu-xmlid='sale.sale_menu_root']",
            content: _t("Let’s create a beautiful quotation in a few clicks ."),
            tooltipPosition: "right",
            run: "click",
        },
        {
            isActive: ["enterprise"],
            trigger: ".o_app[data-menu-xmlid='sale.sale_menu_root']",
            content: _t("Let’s create a beautiful quotation in a few clicks ."),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            trigger: ".o_sale_order",
        },
        {
            trigger: "button.o_list_button_add",
            content: _t("Build your first quotation right here!"),
            tooltipPosition: "bottom",
            run: async function ({ anchor, waitFor }) {
                // sale_management turns this button into a dropdown when
                // quotation templates exist. Keep this in one step: split
                // across two steps, the popover closes itself before the
                // second step's click can land.
                if (anchor.classList.contains("dropdown")) {
                    anchor.click();
                    const newQuotationButton = await waitFor(
                        "div.o_popover:has(.o_sale_management_template) > button.o-dropdown-item:not(.o_sale_management_template)"
                    );
                    newQuotationButton.click();
                } else {
                    anchor.click();
                }
            },
        },
        {
            trigger: ".o_sale_order",
        },
        {
            trigger: ".o_field_res_partner_many2one[name='partner_id'] input",
            content: _t("Search a customer name, or create one on the fly."),
            tooltipPosition: "right",
            run: "edit Agrolait",
        },
        {
            isActive: ["auto"],
            trigger: ".o_m2o_dropdown_option_create_edit",
            content: _t("Create and edit the customer."),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            isActive: ["auto"],
            trigger: ".o_dialog .o_field_widget[name='email'] input",
            content: _t("Enter an email address for your customer."),
            tooltipPosition: "bottom",
            run: "edit agrolait@example.com",
        },
        {
            isActive: ["auto"],
            trigger: ".o_dialog .o_form_button_save",
            content: _t("Save the customer."),
            tooltipPosition: "bottom",
            run: "click",
        },
        // as we are creating product on the fly in next step, which is not supported in sol_label_text
        ...showProductColumn("product_template_id"),
        {
            trigger: ".o_field_x2many_list_row_add > button",
            content: _t("Click here to add some products or services to your quotation."),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            trigger: ".o_sale_order",
        },
        {
            trigger: `
                .o_field_widget[name='product_id'] .o-autocomplete--input,
                .o_field_widget[name='product_template_id'] .o-autocomplete--input
            `,
            content: _t("Select a product, or create a new one on the fly."),
            tooltipPosition: "right",
            run: "edit DESK0001",
        },
        {
            isActive: ["auto"],
            trigger: "a:contains('DESK0001')",
            run: "click",
        },
        {
            trigger: ".oi-arrow-right", // Wait for product creation
        },
        {
            trigger: ".o_field_widget[name='price_unit'] input",
            content: _t("add the price of your product."),
            tooltipPosition: "right",
            run: "edit 10.0 && click body",
        },
        {
            isActive: ["auto"],
            trigger: ".o_field_cell[name='price_subtotal']:contains(10.00)",
            run: "click",
        },
        {
            isActive: ["auto", "mobile"],
            trigger: ".o_statusbar_buttons button[name='action_quotation_send']",
        },
        ...stepUtils.statusbarButtonsSteps(
            "Send",
            markup(_t("<b>Send the quote</b> to yourself and check what the customer will receive.")),
        ),
        {
            isActive: ["body:not(:has(.modal-footer button.o_mail_send))"],
            trigger: ".modal-footer button[name='document_layout_save']",
            content: _t("let's continue"),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            // The customer was created on the fly without an email address,
            // so the composer asks for one before it can send.
            isActive: ["body:has(.o-mail-RecipientsInputTagsListPopover)"],
            trigger: ".o-mail-RecipientsInputTagsListPopover input",
            content: _t("Enter an email address for your customer."),
            tooltipPosition: "bottom",
            run: "edit agrolait@example.com",
        },
        {
            isActive: ["body:has(.o-mail-RecipientsInputTagsListPopover)"],
            trigger: ".o-mail-RecipientsInputTagsListPopover button.btn-primary",
            content: _t("Confirm the email address."),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            trigger: ".modal-footer button.o_mail_send",
            content: _t("Go ahead and send the quotation."),
            tooltipPosition: "bottom",
            run: "click",
        },
        {
            isActive: ["auto"],
            trigger: "body:not(.modal-open)",
            run: "click",
        },
    ],
});
