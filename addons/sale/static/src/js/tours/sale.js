/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_service/tour_utils";
import { markup } from "@odoo/owl";

registry.category("web_tour.tours").add("sale_tour", {
    url: "/web",
    rainbowMan: false,
    sequence: 20,
    steps: () => [stepUtils.showAppsMenuItem(), {
    trigger: ".o_app[data-menu-xmlid='sale.sale_menu_root']",
    content: _t("Let's create a beautiful quotation in a few clicks."),
    position: "right",
    edition: "community"
}, {
    trigger: ".o_app[data-menu-xmlid='sale.sale_menu_root']",
    content: _t("Let's create a beautiful quotation in a few clicks."),
    position: "bottom",
    edition: "enterprise"
}, ]});

registry.category("web_tour.tours").add("sale_quote_tour", {
        url: "/web#action=sale.action_quotations_with_onboarding&view_type=form",
        rainbowMan: true,
        rainbowManMessage: () => markup(_t("<b>Congratulations</b>, your first quotation is sent!<br>Check your email to validate the quote.")),
        sequence: 30,
        steps: () => [{
        trigger: ".o_field_res_partner_many2one[name='partner_id']",
        extra_trigger: ".o_sale_order",
        content: _t("Write a company name to create one, or see suggestions."),
        position: "right",
        run: function (actions) {
            actions.text("Agrolait", this.$anchor.find("input"));
        },
    }, {
        trigger: ".ui-menu-item > a:contains('Agrolait')",
        auto: true,
        in_modal: false,
    }, {
        trigger: ".o_field_x2many_list_row_add > a",
        content: _t("Click here to add some products or services to your quotation."),
        position: "bottom",
    }, {
        trigger: ".o_field_widget[name='product_id'], .o_field_widget[name='product_template_id']",
        extra_trigger: ".o_sale_order",
        content: _t("Select a product, or create a new one on the fly."),
        position: "right",
        run: function (actions) {
            var $input = this.$anchor.find("input");
            actions.text("DESK0001", $input.length === 0 ? this.$anchor : $input);
            var $descriptionElement = $(".o_form_editable textarea[name='name']");
            // when description changes, we know the product has been created
            $descriptionElement.change(function () {
                $descriptionElement.addClass("product_creation_success");
            });
        },
        id: "product_selection_step"
    }, {
        trigger: "a:contains('DESK0001')",
        auto: true,
    }, {
        trigger: ".o_field_text[name='name'] textarea:propValueContains(DESK0001)",
        run: () => {},
        auto: true,
    }, {
        trigger: ".o_field_widget[name='price_unit'] input",
        extra_trigger: ".oi-arrow-right",  // Wait for product creation
        content: markup(_t("<b>Set a price</b>.")),
        position: "right",
        run: "text 10.0"
    }, {
        trigger: ".o_field_monetary[name='price_subtotal']:contains(10.00)",
        auto: true,
    },
    ...stepUtils.statusbarButtonsSteps("Send by Email", markup(_t("<b>Send the quote</b> to yourself and check what the customer will receive.")), ".o_statusbar_buttons button[name='action_quotation_send']"),
    {
        trigger: ".modal-footer button[name='action_send_mail']",
        extra_trigger: ".modal-footer button[name='action_send_mail']",
        content: _t("Let's send the quote."),
        position: "bottom",
    },
    {
        trigger: "body:not(.modal-open)",
        auto: true,
    }
]});
