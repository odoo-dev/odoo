import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { OrderDisplay } from "@point_of_sale/app/components/order_display/order_display";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { useTime } from "@point_of_sale/app/hooks/time_hook";
import { LanguagePopup } from "@pos_self/app/components/language_popup/language_popup";
import { BarcodePopup } from "@pos_self_checkout/app/components/barcode_popup/barcode_popup";
import { PaymentInterface } from "@pos_self/app/components/payment_interface/payment_interface";

export class ScanningPage extends PaymentInterface {
    static template = "pos_self_checkout.ScanningPage";
    static components = { OrderDisplay, Orderline };

    setup() {
        super.setup(...arguments);
        this.time = useTime();
        this.router = useService("router");
        this.dialog = useService("dialog");
        this.notification = useService("notification");

        this.state.pageStatus = "scanning";
        this.state.selectedCategory = null;
        this.selfOrder.computeAvailableCategories();
    }

    get shouldDisplayCategory() {
        if (this.state.selectedCategory && this.state.selectedCategory.child_ids.length == 0) {
            return false;
        }
        return true;
    }

    get shouldDisplayPaymentMethods() {
        return this.state.pageStatus === "payment" && !this.state.paymentMethodId;
    }

    get displayedProducts() {
        return this.selfOrder.getProductToDisplay(this.state.selectedCategory);
    }

    get displayedCategories() {
        if (!this.state.selectedCategory) {
            return this.selfOrder.getAvailableCategories();
        } else if (this.state.selectedCategory.child_ids.length > 0) {
            return this.state.selectedCategory.child_ids;
        }
        return [];
    }

    get paymentRoute() {
        return `/pos-self-checkout/payment/${this.selfOrder.config.id}`;
    }

    async payment() {
        try {
            this.selfOrder.rpcLoading = true;
            if (this.selfOrder.currentOrder.isEmpty()) {
                this.notification.add(
                    _t(
                        "Your cart is empty. Please add some products before proceeding to payment."
                    ),
                    {
                        type: "warning",
                    }
                );
                return;
            }
            const order = await this.selfOrder.sendDraftOrderToServer();

            if (!order) {
                return;
            }
            this.state.pageStatus = "payment";
        } finally {
            this.selfOrder.rpcLoading = false;
        }
    }

    selectCategory(category) {
        this.state.selectedCategory = category;
    }

    selectProduct(product) {
        this.selfOrder.addToCart(product, 1);
    }

    enterBarcodeManually() {
        console.log("Enter barcode manually clicked");
        this.dialog.add(BarcodePopup, {
            text: _t("Enter barcode of the product to add it to your cart."),
            iconClass: "fa fa-barcode",
            warningLevel: "info",
            confirm: (code) => {
                this.selfOrder._barcodeProductAction({
                    base_code: code,
                    code: code,
                    encoding: "any",
                    type: "product",
                });
            },
        });
    }

    onOrderlineLongPress(ev, line) {
        if (!this.selfOrder.adminMode) {
            return;
        }
        console.log("Open popup to edit the line");
    }

    openLanguages() {
        this.dialog.add(LanguagePopup);
    }
}
