import { patch } from "@web/core/utils/patch";
import { SelfOrder } from "@pos_self/app/services/self_service";
import { BarcodePopup } from "@pos_self_checkout/app/components/barcode_popup/barcode_popup";
import { rpc } from "@web/core/network/rpc";
import { debounce } from "@web/core/utils/timing";
import { _t } from "@web/core/l10n/translation";

patch(SelfOrder.prototype, {
    async initData() {
        await super.initData(...arguments);
        await this.initCheckoutData();
    },

    async initCheckoutData() {
        if (this.session && this.access_token) {
            this.ordering = true;
        }
        this.adminMode = false;
        this.adminButtonClickCount = 0;
        this.adminClickTime = null;
        this.helpAsked = false;

        this.sendHelpRequestDebounced = debounce(this.sendHelpRequest, 2000);
    },

    async _barcodeProductAction(code) {
        const productTemplate = await super._barcodeProductAction(...arguments);
        if (!productTemplate) {
            return;
        }
        this.addToCart(productTemplate, 1, "", {}, {});
    },

    toggleAdminMode() {
        if (this.adminMode) {
            this.adminMode = false;
            return;
        }
        this.dialog.add(BarcodePopup, {
            text: _t("Enter the admin code to access admin features."),
            iconClass: "fa fa-user",
            warningLevel: "info",
            confirm: (code) => {
                if (code === this.config.admin_code) {
                    this.adminMode = true;
                }
            },
        });
    },

    clickAdminButton() {
        const now = Date.now();
        if (!this.adminClickTime || now - this.adminClickTime > 3000) {
            this.adminClickTime = now;
            this.adminButtonClickCount = 0;
        }
        this.adminButtonClickCount++;
        if (this.adminButtonClickCount >= 5) {
            this.adminButtonClickCount = 0;
            this.adminClickTime = null;
            this.toggleAdminMode();
        }
    },

    toggleAdminHelp() {
        this.helpAsked = !this.helpAsked;
        this.sendHelpRequestDebounced();
    },

    sendHelpRequest() {
        rpc("/pos-self-checkout/help-request", {
            access_token: this.access_token,
            help_asked: this.helpAsked,
        });
    },

    async sendProcessOrder() {
        return rpc("/pos-self-checkout/process-order/", {
            order: this.currentOrder.serializeForORM(),
            access_token: this.access_token,
        });
    },
});
