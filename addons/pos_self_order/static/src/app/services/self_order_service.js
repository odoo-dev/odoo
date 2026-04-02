import { rpc } from "@web/core/network/rpc";
import { formatDateTime, serializeDateTime } from "@web/core/l10n/dates";
import { TimeoutPopup } from "@pos_self/app/components/timeout_popup/timeout_popup";
import { GeneratePrinterData } from "@point_of_sale/app/utils/printer/generate_printer_data";

import { patch } from "@web/core/utils/patch";
import { SelfOrder } from "@pos_self/app/services/self_service";

patch(SelfOrder.prototype, {
    async _barcodeProductAction(code) {
        const productTemplate = await super._barcodeProductAction(...arguments);
        if (!productTemplate) {
            return;
        }
        if (productTemplate.isConfigurable()) {
            this.router.navigate("product", { id: productTemplate.id });
            return;
        }
        this.addToCart(productTemplate, 1, "", {}, {});
        this.router.navigate("cart");
    },
    async initData() {
        await super.initData(...arguments);
        if (this.config.self_ordering_mode === "kiosk") {
            await this.initKioskData();
        } else if (["mobile", "consultation"].includes(this.config.self_ordering_mode)) {
            await this.initMobileData();
        }
    },
    initHardware() {
        if (this.config.self_ordering_mode !== "kiosk") {
            return;
        }
        super.initHardware(...arguments);
    },
    supportPaymentWebSocket() {
        return this.config.self_ordering_mode === "kiosk";
    },
    supportStatusWebSocket() {
        return this.config.self_ordering_mode === "kiosk";
    },
    /**
     * Return the current table based on the URL identifier
     * This is the only way to be sure of the table the user is using
     * If we rely on the order table, there could be mismatches if the user
     * scanned another QR code after creating the order.
     */
    get currentTable() {
        const tableIdentifier = this.router.getTableIdentifier();
        const table = this.models["restaurant.table"].find((t) => t.identifier === tableIdentifier);
        return table || null;
    },
    get selfService() {
        const presets = this.models["pos.preset"].getAll();
        return this.config.use_presets && presets.length > 0
            ? this.currentOrder?.preset_id?.service_at
            : this.config.self_ordering_service_mode;
    },
    showComboSelectionPage(product) {
        const selectedCombos = [];
        for (const combo of product.combo_ids) {
            const { combo_item_ids } = combo;
            if (
                combo_item_ids.length > 1 ||
                combo.qty_max > 1 ||
                combo_item_ids[0]?.product_id.isConfigurable()
            ) {
                return { show: true, selectedCombos: [] };
            }
            selectedCombos.push({
                combo_item_id: this.models["product.combo.item"].get(combo_item_ids[0].id),
                configuration: {
                    attribute_custom_values: [],
                    attribute_value_ids: [],
                    price_extra: 0,
                },
            });
        }
        return { show: false, selectedCombos };
    },
    resetCategorySelection() {
        if (!this.kioskMode) {
            return super.resetCategorySelection(...arguments);
        }
        this.currentCategory = this.availableCategories[0];
    },
    hasPaymentMethod() {
        return (
            this.config.self_ordering_mode === "kiosk" &&
            this.models["pos.payment.method"].getAll().length > 0
        );
    },
    async confirmOrder() {
        const payAfter = this.config.self_ordering_pay_after; // each, meal
        const device = this.config.self_ordering_mode; // kiosk, mobile
        const service = this.selfService; // table, counter, delivery

        let order = this.currentOrder;
        const orderHasChanges = Object.keys(order.changes).length > 0;

        // Stand number page will recall this function after the stand number is set
        if (
            service === "table" &&
            !order.isTakeaway &&
            device === "kiosk" &&
            !order.table_stand_number
        ) {
            this.router.navigate("stand_number");
            return;
        }

        order = await this.sendDraftOrderToServer();

        if (!order) {
            return;
        }

        // When no payment methods redirect to confirmation page
        // the client will be able to pay at counter
        if (!this.hasPaymentMethod()) {
            let screenMode = "pay";

            if (orderHasChanges) {
                screenMode = payAfter === "meal" ? "order" : "pay";
            }

            this.confirmationPage(screenMode, device, order.access_token);
        } else {
            // In meal mode, first time the customer validate his order, we send it to the server
            // and we redirect him to the confirmation page, the next time he validate his order
            // if the order is already saved on the server, we redirect him to the payment page
            // In each mode, we redirect the customer to the payment page directly
            if (payAfter === "meal" && orderHasChanges) {
                await this.sendDraftOrderToServer();
                this.confirmationPage("order", device, order.access_token);
            } else {
                this.router.navigate("payment");
            }
        }
    },
    isOrderAvailable(order) {
        const isDraft = order.state === "draft";
        const isPaid = order.state === "paid";
        const isZeroAmount = order.amount_total === 0;
        const isKiosk = this.config.self_ordering_mode === "kiosk";

        return (
            isDraft ||
            (isPaid && isZeroAmount && isKiosk) ||
            (isPaid && this.router.activeSlot === "confirmation")
        );
    },
    get kioskMode() {
        return this.config.self_ordering_mode === "kiosk";
    },
    async initKioskData() {
        if (this.session && this.access_token) {
            this.ordering = true;
        }

        window.addEventListener("click", (event) => {
            clearTimeout(this.idleTimout);
            this.timeoutPopup?.();
            this.idleTimout = setTimeout(() => {
                if (this.router.activeSlot !== "payment" && this.router.activeSlot !== "default") {
                    this.timeoutPopup = this.dialog.add(TimeoutPopup, {
                        onTimeout: () => {
                            this.dialog.closeAll();
                            this.router.navigate("default");
                        },
                    });
                }
            }, 1000 * 90);
        });
    },
    async initMobileData() {
        if (this.config.self_ordering_mode !== "qr_code") {
            if (
                this.session &&
                this.access_token &&
                this.config.self_ordering_mode !== "consultation"
            ) {
                await this.getUserDataFromServer();
                this.ordering = true;
            }

            if (!this.ordering) {
                return;
            }
        }
    },
    shouldCancelBackendOrder() {
        return (
            (this.config.self_ordering_mode === "kiosk" &&
                this.hasPaymentMethod() &&
                typeof this.currentOrder.id === "number") ||
            super.shouldCancelBackendOrder(...arguments)
        );
    },
    shouldUpdateLastOrderChange() {
        return this.config.self_ordering_mode !== "kiosk";
    },
    async sendProcessOrder() {
        const tableIdentifier = this.router.getTableIdentifier();
        return rpc(`/pos-self-order/process-order/${this.config.self_ordering_mode}`, {
            order: this.currentOrder.serializeForORM(),
            access_token: this.access_token,
            table_identifier: tableIdentifier, // Always trust URL one, is the one user scanned
        });
    },
    async sendGetUserData(accessTokens = []) {
        const tableIdentifier = this.router.getTableIdentifier();
        return rpc(`/pos-self-order/get-user-data/`, {
            access_token: this.access_token,
            order_access_tokens: accessTokens,
            table_identifier: tableIdentifier,
        });
    },
    getAccessTokens(tokens) {
        const dbAccessToken = this.models["pos.order"]
            .filter((o) => o.state === "draft" && o.isSynced && o.access_token)
            .map((order) => ({
                access_token: order.access_token,
                state: order.state,
                write_date: serializeDateTime(order.write_date.plus({ seconds: 1 })),
            }));

        // Token given in argument are probably not in the local database
        // so write_date is set to 1970-01-01 00:00:00
        const argTokens = tokens.map((token) => ({
            access_token: token,
            write_date: "1970-01-01 00:00:00",
        }));
        return [...dbAccessToken, ...argTokens];
    },
    async getUserDataFromServer(tokens = []) {
        const accessTokens = this.getAccessTokens(tokens);
        if (!accessTokens.length && !this.router.getTableIdentifier()) {
            return;
        }
        await super.getUserDataFromServer(...arguments);
    },
    showDownloadButton(order) {
        return this.config.self_ordering_mode === "mobile" && order.state === "paid";
    },
    async downloadReceipt(order) {
        const link = document.createElement("a");
        const currentDate = formatDateTime(luxon.DateTime.now(), {
            format: "MM_dd_yyyy-HH_mm_ss",
        });
        const companyName = this.company.name.replaceAll(" ", "_");
        link.download = `${companyName}-${currentDate}.png`;

        const template = "point_of_sale.pos_order_receipt";
        const generator = new GeneratePrinterData({ models: this.data.models, order });
        const data = generator.generateReceiptData();
        const iframe = await this.ticketPrinter.generateIframe(template, data);
        const image = await this.ticketPrinter.generateImage(iframe);

        link.href = image.toDataURL().replace("data:image/jpeg;base64,", "");
        link.click();
    },
});
