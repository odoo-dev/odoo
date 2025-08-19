import * as combo from "@point_of_sale/../tests/pos/tours/utils/combo_popup_util";
import * as Chrome from "@point_of_sale/../tests/pos/tours/utils/chrome_util";
import * as Dialog from "@point_of_sale/../tests/generic_helpers/dialog_util";
import * as ProductScreen from "@point_of_sale/../tests/pos/tours/utils/product_screen_util";
import * as PaymentScreen from "@point_of_sale/../tests/pos/tours/utils/payment_screen_util";
import * as ReceiptScreen from "@point_of_sale/../tests/pos/tours/utils/receipt_screen_util";
import { escapeRegExp } from "@web/core/utils/strings";
import { registry } from "@web/core/registry";

export function addComboProduct(comboProductName, wizardSteps) {
    return [
        ProductScreen.clickDisplayedProduct(comboProductName),
        ...(wizardSteps || []),
        ProductScreen.clickPartnerButton(),
        ProductScreen.clickCustomer("AAAAAA"),
    ];
}

export function checkComboProductTotal(comboProductName, total) {
    return {
        content: `Combo line with name: ${comboProductName} with total: ${total} exists`,
        trigger: `.orderline:has(.product-name:contains('${comboProductName}')):has(.product-price:contains('${total}'))`,
    }
}

export function payAndInvoice(totalAmount) {
    return [
        ProductScreen.clickPayButton(),

        PaymentScreen.totalIs(totalAmount),
        PaymentScreen.clickPaymentMethod("Bank"),
        PaymentScreen.remainingIs("0.0"),

        PaymentScreen.clickInvoiceButton(),
        PaymentScreen.clickValidate(),

        ReceiptScreen.receiptAmountTotalIs(totalAmount),
        ReceiptScreen.clickNextOrder(),
    ];
}

registry
    .category("web_tour.tours")
    .add("test_taxes_l10n_be_pos", {
        steps: () =>
            [
                Chrome.startPoS(),
                Dialog.confirm("Open Register"),

                ...addComboProduct("product_combo_1_1"),
                checkComboProductTotal("product_combo_1_1", "134.31"),
                ProductScreen.checkTotalAmount("134.31"),
                ProductScreen.checkTaxAmount("24.31"),
                ...payAndInvoice("134.31"),

                ...addComboProduct("product_combo_2_1"),
                checkComboProductTotal("product_combo_2_1", "140.36"),
                ProductScreen.checkTotalAmount("140.36"),
                ProductScreen.checkTaxAmount("25.36"),
                ...payAndInvoice("140.36"),

                ...addComboProduct("product_combo_3_1", [
                    combo.checkTotal("42.0"),
                    combo.clickQtyBtnAdd("product_3_1"),
                    combo.checkTotal("43.0"),
                    combo.clickQtyBtnAdd("product_3_1"),
                    combo.checkTotal("44.0"),
                    combo.select("product_3_2"),
                    combo.checkTotal("45.0"),
                    Dialog.confirm(),
                ]),
                checkComboProductTotal("product_combo_3_1", "60.5"),
                ProductScreen.checkTotalAmount("60.5"),
                ProductScreen.checkTaxAmount("15.5"),
                ...payAndInvoice("60.5"),

                ...addComboProduct("product_combo_4_1"),
                checkComboProductTotal("product_combo_4_1", "37.73"),
                ...addComboProduct("product_combo_4_2"),
                checkComboProductTotal("product_combo_4_2", "37.73"),
                ProductScreen.checkTotalAmount("75.43"),
                ProductScreen.checkTaxAmount("15.09"),
                ...payAndInvoice("75.43"),

                ...addComboProduct("product_combo_5_1"),
                checkComboProductTotal("product_combo_5_1", "782.88"),
                ProductScreen.checkTotalAmount("782.88"),
                ProductScreen.checkTaxAmount("82.88"),
                ...payAndInvoice("782.88"),
            ].flat(),
    });

registry
    .category("web_tour.tours")
    .add("test_change_pricelist_pos", {
        steps: () =>
            [
                Chrome.startPoS(),
                Dialog.confirm("Open Register"),

                ...addComboProduct("test_change_of_pricelist_pos"),
                checkComboProductTotal("test_change_of_pricelist_pos", "781.67"),
                ProductScreen.checkTotalAmount("781.67"),
                ProductScreen.checkTaxAmount("81.67"),
                ...payAndInvoice("781.67"),

                ...addComboProduct("test_change_of_pricelist_pos"),
                ProductScreen.clickPriceList("another_pricelist"),
                checkComboProductTotal("test_change_of_pricelist_pos", "321.0"),
                ProductScreen.checkTotalAmount("321.0"),
                ProductScreen.checkTaxAmount("21.0"),
                ...payAndInvoice("321.0"),

                ...addComboProduct("test_change_of_pricelist_pos"),
                ProductScreen.clickPriceList("another_pricelist_global_discount"),
                checkComboProductTotal("test_change_of_pricelist_pos", "1,020.27"),
                // product_1 has an original price of 700.0 with 21% tax
                // product_2 has an original price of 400.0
                // After the FP, the prices are 630.0 & 360.0 and the combo is 900.0.
                // Base of product_1 is 630.0 / (630.0 + 360.0) * 900.0 = 572.727272727.
                // Tax amount of product_1 is 572.727272727 * 0.21 ~= 120.27
                // Total of the pos order: 900 + 120.27 = 1020.27
                ProductScreen.checkTotalAmount("1,020.27"),
                ProductScreen.checkTaxAmount("120.27"),
                ...payAndInvoice("1,020.27"),

            ].flat(),
    });
