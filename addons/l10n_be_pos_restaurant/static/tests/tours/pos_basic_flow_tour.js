import * as ProductScreen from "@point_of_sale/../tests/pos/tours/utils/product_screen_util";
import * as PaymentScreen from "@point_of_sale/../tests/pos/tours/utils/payment_screen_util";
import * as ReceiptScreen from "@point_of_sale/../tests/pos/tours/utils/receipt_screen_util";
import * as Chrome from "@point_of_sale/../tests/pos/tours/utils/chrome_util";
import * as Dialog from "@point_of_sale/../tests/generic_helpers/dialog_util";
import * as FloorScreen from "@pos_restaurant/../tests/tours/utils/floor_screen_util";

import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("test_pos_receipt_label_on_receipt", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            FloorScreen.clickTable("2"),
            ProductScreen.clickPartnerButton(),
            ProductScreen.clickCustomer("Acme Corporation"),
            ProductScreen.clickDisplayedProduct("Desk Organizer", false),
            {
                ...Dialog.confirm(),
                content: "validate the variant dialog (with default values)",
            },
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Cash"),
            PaymentScreen.clickValidate(),
            ReceiptScreen.isShown(),
            {
                trigger: ".pos-receipt .product-price",
                run: function ({ anchor }) {
                    const taxGroupElement = anchor.nextElementSibling;
                    if (!taxGroupElement || !taxGroupElement.textContent.includes("A")) {
                        throw new Error(
                            "Tax group 'A' is not displayed next to the product price on the receipt."
                        );
                    }
                },
            },
            ReceiptScreen.clickNextOrder(),
            FloorScreen.clickTable("2"),
            ProductScreen.clickPartnerButton(),
            ProductScreen.clickCustomer("Acme Corporation"),
            ProductScreen.clickDisplayedProduct("Desk Organizer", false),
            {
                ...Dialog.confirm(),
                content: "validate the variant dialog (with default values)",
            },
            ProductScreen.selectPreset("Eat in", "Takeaway"),
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Cash"),
            PaymentScreen.clickValidate(),
            ReceiptScreen.isShown(),
            {
                trigger: ".pos-receipt .product-price",
                run: function ({ anchor }) {
                    const taxGroupElement = anchor.nextElementSibling;
                    if (!taxGroupElement || !taxGroupElement.textContent.includes("C")) {
                        throw new Error(
                            "Tax group 'C' is not displayed next to the product price on the receipt."
                        );
                    }
                },
            },
            ReceiptScreen.clickNextOrder(),
        ].flat(),
});
