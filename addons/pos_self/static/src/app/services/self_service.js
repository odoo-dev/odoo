import { Reactive } from "@web/core/utils/reactive";
import { ConnectionLostError, RPCError, rpc } from "@web/core/network/rpc";
import { _t } from "@web/core/l10n/translation";
import { formatCurrency as webFormatCurrency } from "@web/core/currency";
import { markup } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { registry } from "@web/core/registry";
import { cookie } from "@web/core/browser/cookie";
import { serializeDateTime } from "@web/core/l10n/dates";
import { NetworkConnectionLostPopup } from "@pos_self/app/components/network_connectionLost_popup/network_connectionLost_popup";
import { UnavailableProductsDialog } from "@pos_self/app/components/unavailable_product_dialog/unavailable_product_dialog";
import {
    constructFullProductName,
    random5Chars,
    isValidPhone,
    isValidEmail,
    orderUsageUTCtoLocalUtil,
    getTimeUtil,
} from "@point_of_sale/utils";
import { getOrderLineValues } from "@pos_self/app/services/card_utils";
import { initLNA } from "@point_of_sale/app/utils/init_lna";
import { SnoozedProductTracker } from "@point_of_sale/app/models/utils/snooze_tracker";

const { DateTime } = luxon;

export class SelfOrder extends Reactive {
    static serviceDependencies = [
        "notification",
        "router",
        "pos_data",
        "pos_ticket_printer",
        "bus_service",
        "dialog",
    ];

    constructor(...args) {
        super();
        this.ready = this.setup(...args).then(() => this);
    }

    async setup(env, { notification, router, pos_ticket_printer, bus_service, dialog, pos_data }) {
        // services
        this.notification = notification;
        this.router = router;
        this.data = pos_data;
        this.env = env;
        this.ticketPrinter = pos_ticket_printer;
        this.bus = bus_service;
        this.dialog = dialog;

        // data
        this.models = this.data.models;
        this.session = this.models["pos.session"].getFirst();
        this.config = this.models["pos.config"].getFirst();
        this.company = this.config.company_id;
        this.currency = this.config.currency_id;

        this.markupDescriptions();
        this.access_token = odoo.access_token;
        this.rpcLoading = false;
        this.paymentError = false;
        this.selectedOrderUuid = null;
        this.ordering = false;
        this.productCategories = [];
        this.currentCategory = null;
        this.productByCategIds = {};
        this.availableCategories = [];
        this.snoozedProductTracker = new SnoozedProductTracker();

        await this.initData();
        this.initWebSocket();
    }

    async _barcodeProductAction(code) {
        if (!this.ordering) {
            this.notification.add(_t("We're currently closed"), {
                type: "danger",
            });
            return;
        }
        if (this.getOrder() == null) {
            return this.startOrder();
        }
        const product = this.models["product.product"].filter(
            (p) => p.barcode === code.base_code
        )?.[0];
        if (!product) {
            this.notification.add(_t("Product not found"), {
                type: "danger",
            });
            return;
        }
        if (!product.self_order_available) {
            this.notification.add(_t("Product is not available"), {
                type: "danger",
            });
            return;
        }
        const productTemplate = product.product_tmpl_id;
        return productTemplate;
    }

    initWebSocket() {
        this.data.connectWebSocket("ORDER_STATE_CHANGED", () => this.getUserDataFromServer());
        this.data.connectWebSocket("SNOOZE_CHANGED", async (payload) => {
            const { deleted_ids, records } = payload;
            if (deleted_ids) {
                const snoozeModel = this.models["pos.product.template.snooze"];
                snoozeModel.deleteMany(
                    deleted_ids.map((id) => snoozeModel.get(id)).filter(Boolean)
                );
            }
            if (records.length > 0) {
                await this.models.connectNewData({ "pos.product.template.snooze": records });
            }
            this.snoozedProductTracker.setSnoozes(this.config.pos_snooze_ids);
        });
        this.data.connectWebSocket("PRODUCT_CHANGED", (payload) => {
            const productTemplateIds = payload["product.template"].map((tmpl) => tmpl.id);
            const existingProductIds = this.models["product.template"].filter((tmpl) =>
                productTemplateIds.includes(tmpl.id)
            );
            const hasNewProducts = productTemplateIds.length !== existingProductIds.length;
            this.models.connectNewData(payload);
            if (hasNewProducts) {
                this.initProducts();
            }
        });
        if (this.supportPaymentWebSocket()) {
            this.data.connectWebSocket("STATUS", ({ status }) => {
                if (status === "closed") {
                    this.pos_session = [];
                    this.ordering = false;
                } else {
                    // reload to get potential new settings
                    // more easier than RPC for now
                    window.location.reload();
                }
            });
        }
        if (this.supportStatusWebSocket()) {
            this.data.connectWebSocket("PAYMENT_STATUS", ({ payment_result, data }) => {
                if (payment_result === "Success") {
                    this.models.connectNewData(data);
                    const order = this.models["pos.order"].find(
                        (o) => o.access_token === data["pos.order"][0].access_token
                    );
                    if (["paid", "done"].includes(order?.state)) {
                        this.notification.add(_t("Your order has been paid"), {
                            type: "success",
                        });
                        this.confirmationPage(
                            "order",
                            this.config.self_ordering_mode,
                            order.access_token
                        );
                    }
                } else {
                    this.paymentError = true;
                }
            });
        }
        this.data.connectWebSocket("REMOVE_ORDERS", (data) => {
            this.removeOrdersByAccessTokens(data.deleted_order_tokens);
        });
    }

    supportPaymentWebSocket() {
        // Will be overriden by inheriting modules
        return false;
    }

    supportStatusWebSocket() {
        // Will be overriden by inheriting modules
        return false;
    }

    getAvailableCategories() {
        let now = luxon.DateTime.now();
        now = now.hour + now.minute / 60;
        const availableCategories = this.productCategories
            .filter(
                (c) => this.productByCategIds[c.id]?.length > 0 || c.associatedProducts?.length > 0
            )
            .sort((a, b) => a.sequence - b.sequence);
        return availableCategories.filter((c) => {
            const hourStart = c.hour_after;
            const hourUntil = c.hour_until;
            if (hourStart === hourUntil || (hourStart === 0 && hourUntil === 24)) {
                // if equal, it means open the whole day
                return true;
            } else if (hourStart < hourUntil) {
                // in this case, if current time is in between, then shop is open
                return now >= hourStart && now <= hourUntil;
            } else {
                // in this case, if current time is in between, then shop is closed
                return !(now >= hourStart && now <= hourUntil);
            }
        });
    }
    getProductToDisplay(category) {
        const products =
            category.associatedProducts || this.selfOrder.productByCategIds[category.id] || [];

        if (!products.length) {
            return [];
        }

        return products.filter(
            (product) =>
                product.self_order_available &&
                (product.pos_categ_ids.length == 0 ||
                    product.pos_categ_ids.some((categ) => this.isCategoryAvailable(categ.id)))
        );
    }
    computeAvailableCategories() {
        this.availableCategories = this.getAvailableCategories();
        this.currentCategory = this.availableCategories[0];
    }

    isCategoryAvailable(categId) {
        return this.availableCategories.find((c) => c.id === categId);
    }

    removeLine(line) {
        this.currentOrder.removeOrderline(line);
    }

    async syncPresetSlotAvaibility(preset) {
        try {
            const presetAvailabilities = await rpc(`/pos-self-order/get-slots`, {
                access_token: this.access_token,
                preset_id: this.currentOrder?.preset_id?.id,
            });
            const localUsage = orderUsageUTCtoLocalUtil(presetAvailabilities.usage_utc);
            preset.computeAvailabilities(localUsage);
        } catch {
            console.info("Offline mode, cannot update the slot avaibility");
        }
    }

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
    }

    async addToCart(
        productTemplate,
        qty,
        customer_note,
        selectedValues = {},
        customValues = {},
        comboValues = {}
    ) {
        const product = productTemplate.product_variant_ids[0];
        const values = getOrderLineValues(
            this,
            productTemplate,
            qty,
            customer_note,
            selectedValues,
            customValues,
            comboValues
        );
        const newLine = this.models["pos.order.line"].create(values);
        newLine.full_product_name = constructFullProductName(
            newLine,
            this.models["product.template.attribute.value"].getAllBy("id"),
            product.name
        );
        const lineToMerge = this.currentOrder.lines.find(
            (l) => l.canBeMergedWith(newLine) && l.id !== newLine.id
        );

        if (lineToMerge) {
            lineToMerge.setQuantity(lineToMerge.qty + newLine.qty);
            newLine.delete();
        }
    }
    async confirmationPage(screen_mode, device, access_token) {
        if (!access_token) {
            throw new Error("No access token provided for confirmation page");
        }

        this.router.navigate("confirmation", {
            orderAccessToken: access_token || this.currentOrder.access_token,
            screenMode: screen_mode,
        });
        this.resetCategorySelection();
    }

    resetCategorySelection() {
        return;
    }

    get currentOrder() {
        const currentOrder = this.getOrder();
        if (currentOrder) {
            return currentOrder;
        }

        const existingOrder = this.models["pos.order"].find((o) => this.isOrderAvailable(o));
        if (existingOrder) {
            this.selectedOrderUuid = existingOrder.uuid;
            return existingOrder;
        }
        return this.createNewOrder();
    }

    isOrderAvailable(order) {
        // Will be overriden by inheriting modules
        return true;
    }

    getOrder() {
        const order = this.models["pos.order"].getBy("uuid", this.selectedOrderUuid);
        if (order && this.isOrderAvailable(order)) {
            return order;
        } else {
            return null;
        }
    }

    createNewOrder() {
        const autoSelectedPresets =
            this.models["pos.preset"].length === 1 && this.config.use_presets;

        const fiscalPosition = autoSelectedPresets
            ? this.config.default_preset_id?.fiscal_position_id
            : this.config.default_fiscal_position_id;

        const pricelist = autoSelectedPresets
            ? this.config.default_preset_id?.pricelist_id
            : this.config.pricelist_id;

        return this.models["pos.order"].create({
            company_id: this.company,
            ticket_code: random5Chars(),
            session_id: this.session,
            config_id: this.config,
            fiscal_position_id: fiscalPosition,
            pricelist_id: pricelist,
            preset_id: autoSelectedPresets ? this.config.default_preset_id : false,
        });
    }

    markupDescriptions() {
        for (const product of this.models["product.template"].getAll()) {
            product.public_description = product.public_description
                ? markup(product.public_description)
                : "";
        }
    }

    initProducts() {
        this.productCategories = this.config.limit_categories
            ? this.config.iface_available_categ_ids
            : this.models["pos.category"].getAll();
        this.productByCategIds = this.models["product.template"].getAllBy("pos_categ_ids");

        const excludedProductTemplateIds = new Set(
            this.config._pos_special_products_ids
                .map((id) => this.models["product.product"].get(id)?.product_tmpl_id?.id)
                .filter(Boolean)
        );

        for (const category_id in this.productByCategIds) {
            this.productByCategIds[category_id] = this.productByCategIds[category_id].filter(
                (p) => !excludedProductTemplateIds.has(p.id)
            );
        }
        const productWoCat = this.models["product.template"].filter(
            (p) => p.pos_categ_ids.length === 0 && !excludedProductTemplateIds.has(p.id)
        );

        if (productWoCat.length && !this.config.iface_available_categ_ids.length) {
            this.productCategories.push({
                id: 0,
                hour_after: 0,
                hour_until: 24,
                name: _t("Uncategorised"),
            });
            this.productByCategIds["0"] = productWoCat;
        }
    }

    initHardware() {
        for (const pm of this.models["pos.payment.method"].getAll()) {
            const PaymentInterface = registry
                .category("pos_payment_providers")
                .get(pm.payment_provider, null);
            if (PaymentInterface) {
                pm.payment_interface = new PaymentInterface(this, pm);
            }
        }

        if (this.ticketPrinter.useLna) {
            initLNA(this.notification);
        }
    }

    async initData() {
        this.snoozedProductTracker.setSnoozes(this.config.pos_snooze_ids);
        this.initProducts();
        this._initLanguages();
        this.initHardware();
    }

    _initLanguages() {
        const languages = this.config.self_ordering_available_language_ids;
        this.currentLanguage = languages.find((l) => l.code === cookie.get("frontend_lang"));
        if (languages && !this.currentLanguage) {
            this.currentLanguage = this.config.self_ordering_default_language_id;
        }
        languages?.forEach((lg) => {
            // To display  "Français (BE)"  instead of "French (BE) / Français (BE)"
            lg.display_name = lg.name.split("/").pop();
        });
        cookie.set("frontend_lang", this.currentLanguage?.code || "en_US");
    }

    isProductSnoozed(product) {
        return this.snoozedProductTracker.isProductSnoozed(product);
    }

    removeOrdersByAccessTokens(orderAccessTokens = []) {
        // Remove orders and their dependent records locally and from IndexedDB
        this.models["pos.order"]
            .filter((o) => orderAccessTokens.includes(o.access_token))
            .forEach((o) => this.data.localDeleteCascade(o));
    }

    isValidSelection(slot, partner) {
        const preset = this.currentOrder.preset_id || {};
        const { id, name, email, phone, street, city, country_id, state_id, zip } = partner || {};
        const country = this.models["res.country"].get(country_id);
        const hasStates = country?.state_ids?.length || 0;
        const validState = !hasStates || state_id;
        const partnerInfo = name && phone && street && city && country_id && validState && zip;
        const selectedPartner = typeof id === "number" && !isNaN(id);
        const validPartnerInfos = partnerInfo || selectedPartner;

        return (
            (!preset.needsSlot || DateTime.fromSQL(slot).isValid) &&
            (!preset.needsName || name) &&
            (!preset.needsEmail || selectedPartner || isValidEmail(email)) &&
            (!preset.needsPartner || validPartnerInfos) &&
            (!phone || selectedPartner || isValidPhone(phone))
        );
    }

    cancelOrder() {
        if (this.shouldCancelBackendOrder()) {
            this.cancelBackendOrder();
            return;
        }

        const lineToDelete = [];
        for (const line of this.currentOrder.lines) {
            const changes = line.changes;
            if (Object.values(changes).some((v) => v)) {
                if (line.qty <= changes.qty) {
                    lineToDelete.push(line);
                } else {
                    line.update({
                        qty: changes["qty"],
                        customer_note: changes["customer_note"],
                        attribute_value_ids: changes["attribute_value_ids"]
                            ? JSON.parse(changes["attribute_value_ids"]).map((a) => [
                                  "link",
                                  this.models["product.template.attribute.value"].get(a),
                              ])
                            : [],
                        custom_attribute_value_ids: changes["custom_attribute_value_ids"]
                            ? JSON.parse(changes["custom_attribute_value_ids"]).map((a) => [
                                  "link",
                                  this.models["product.attribute.custom.value"].get(a),
                              ])
                            : [],
                    });
                }
            }
        }

        for (const line of lineToDelete) {
            line.delete();
        }

        this.currentOrder.recomputeChanges();
        if (Math.max(this.currentOrder.lines.map((l) => l.qty)) <= 0) {
            this.router.navigate("default");
            this.data.localDeleteCascade(this.currentOrder);
            this.selectedOrderUuid = null;
        }
    }

    shouldCancelBackendOrder() {
        // Will be overriden by inheriting modules
        return false;
    }

    async cancelBackendOrder() {
        try {
            await rpc("/pos-self-order/remove-order", {
                access_token: this.access_token,
                order_id: this.currentOrder.id,
                order_access_token: this.currentOrder.access_token,
            });
            this.currentOrder.state = "cancel";
            this.router.navigate("default");
        } catch (error) {
            this.handleErrorNotification(error);
        }
    }

    shouldUpdateLastOrderChange() {
        // Will be overriden by inheriting modules
        return false;
    }

    async sendProcessOrder() {
        // Will be overriden by inheriting modules
        return {};
    }

    async sendDraftOrderToServer() {
        if (
            Object.keys(this.currentOrder.changes).length === 0 ||
            this.currentOrder.lines.length === 0
        ) {
            return this.currentOrder;
        }

        try {
            this.currentOrder.setOrderPrices();
            let uuid = this.selectedOrderUuid;
            if (this.shouldUpdateLastOrderChange()) {
                this.currentOrder.updateLastOrderChange();
            }
            const data = await this.sendProcessOrder();
            const result = this.models.connectNewData(data);
            if (result["pos.order"][0].uuid !== this.selectedOrderUuid) {
                this.currentOrder.delete();
                uuid = result["pos.order"][0].uuid;
            }
            this.data.debouncedSynchronizeLocalDataInIndexedDB();

            if (this.config.self_ordering_pay_after === "each") {
                this.selectedOrderUuid = null;
            }

            this.currentOrder.recomputeChanges();
            return this.models["pos.order"].getBy("uuid", uuid);
        } catch (error) {
            const order = this.models["pos.order"].getBy("uuid", this.selectedOrderUuid);
            this.handleErrorNotification(error, [order.access_token]);
            return false;
        }
    }

    async sendGetUserData(accessTokens = []) {
        // Will be overriden by inheriting modules
        return {};
    }

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
    }

    async getUserDataFromServer(tokens = []) {
        const accessTokens = this.getAccessTokens(tokens);
        try {
            const data = await this.sendGetUserData(accessTokens);
            const result = this.models.connectNewData(data);
            const openOrder = result["pos.order"]?.find((o) => o.state === "draft");
            if (openOrder && this.router.activeSlot !== "confirmation") {
                this.selectedOrderUuid = openOrder.uuid;

                // Remove all other open orders in draft and add orderline in the current order
                const lineCmd = [];
                for (const order of this.models["pos.order"].filter((o) => o.state === "draft")) {
                    if (order.uuid !== openOrder.uuid) {
                        lineCmd.push(...order.lines);
                        order.delete();
                    }
                }

                openOrder.update({
                    lines: [["link", lineCmd]],
                });
                openOrder.recomputeChanges();
            }
            this.data.debouncedSynchronizeLocalDataInIndexedDB();
        } catch (error) {
            this.handleErrorNotification(
                error,
                this.models["pos.order"].map((order) => order.access_token)
            );
        }
    }

    isOrder() {
        if (!this.currentOrder || !this.currentOrder.lines.length) {
            this.router.navigate("default");
        }
    }

    handleErrorNotification(error, accessToken = []) {
        this.rpcLoading = false;

        let message = _t("An error has occurred");
        let cleanOrders = false;

        if (error instanceof RPCError) {
            if (error.data.name === "werkzeug.exceptions.Unauthorized") {
                message = _t("You're not authorized to perform this action");
                cleanOrders = true;
            } else if (error.data.name === "werkzeug.exceptions.NotFound") {
                message = _t("Orders not found on server");
                cleanOrders = true;
            } else if (error?.data?.name === "odoo.exceptions.UserError") {
                message = error.data.message;
            }
        } else if (error instanceof ConnectionLostError) {
            this.dialog.add(NetworkConnectionLostPopup, {
                close: () => this.dialog.closeAll(),
                access_token: this.access_token,
            });
            return;
        }

        this.notification.add(message, {
            type: "danger",
        });

        if (accessToken && cleanOrders) {
            this.selectedOrderUuid = null;

            for (const index in this.orders) {
                if (accessToken.includes(this.orders[index].access_token)) {
                    this.orders.splice(index, 1);
                }
            }
        }
    }

    formatMonetary(price) {
        return webFormatCurrency(price, this.currency.id);
    }

    verifyCart() {
        let result = true;
        const unavailableProducts = new Set();

        for (const line of this.currentOrder.unsentLines) {
            if (line.combo_parent_id?.uuid) {
                continue;
            }

            const lineChanges = this.currentOrder.uiState.lineChanges[line.uuid];
            const alreadySent = lineChanges
                ? Object.values(this.currentOrder.uiState.lineChanges[line.uuid]).every((v) => !v)
                : false;

            const wrongChild = line.combo_line_ids.find((l) => !l.product_id.self_order_available);
            if (wrongChild || !line.product_id?.self_order_available) {
                if (alreadySent) {
                    line.qty = alreadySent.qty;
                    line.customer_note = alreadySent.customer_note;
                    line.selected_attributes = alreadySent.selected_attributes;
                } else {
                    const productName = !line.product_id?.self_order_available
                        ? line.product_id?.name
                        : wrongChild?.product_id?.name;

                    if (productName) {
                        unavailableProducts.add(productName);
                    }
                    // Remove all children and parent if any product is unavailable
                    line.combo_line_ids.forEach((childLine) => {
                        childLine.delete();
                    });
                    line.delete();
                }
                result = false;
            }
        }

        if (unavailableProducts.size) {
            const productNames = Array.from(unavailableProducts);
            const goBackIfCartEmpty = () => {
                if (!this.currentOrder.unsentLines.length) {
                    this.router.back();
                }
            };
            this.dialog.add(UnavailableProductsDialog, {
                productNames: productNames,
                onClose: goBackIfCartEmpty,
            });
        }
        return result;
    }

    getProductPriceInfo(productTemplate, product) {
        const pricelist = this.currentOrder.preset_id?.pricelist_id || this.config.pricelist_id;
        const price = productTemplate.getPrice(pricelist, 1, 0, false, product);

        if (!product) {
            product = productTemplate;
        }

        // Taxes computation.
        const order = this.currentOrder;
        const taxesData = product.getTaxDetails({
            overridedValues: {
                price,
                fiscalPosition: order?.fiscal_position_id || false,
            },
        });
        return { pricelist_price: price, ...taxesData };
    }
    getProductDisplayPrice(productTemplate, product) {
        const taxesData = this.getProductPriceInfo(productTemplate, product);
        if (this.isTaxesIncludedInPrice()) {
            return taxesData.total_included;
        } else {
            return taxesData.total_excluded;
        }
    }

    isTaxesIncludedInPrice() {
        return this.config.iface_tax_included === "total";
    }

    hasPresets() {
        return this.config.use_presets && this.models["pos.preset"].length > 1;
    }
    getTime(date) {
        return getTimeUtil(date);
    }

    getPendingPaymentLine(provider) {
        const currentPaymentLine = this.getOrder()?.getSelectedPaymentline();
        return currentPaymentLine?.payment_method_id?.payment_provider === provider
            ? currentPaymentLine
            : null;
    }

    get orderLineNotSend() {
        return Object.entries(this.currentOrder.changes).reduce(
            (acc, [key, { qty }]) => {
                if (qty && qty > 0) {
                    const line = this.models["pos.order.line"].getBy("uuid", key);
                    if (!line.combo_parent_id) {
                        acc.count += qty;
                    }
                    const prices = line.prices;
                    acc.priceWithTax += prices.total_included;
                    acc.priceWithoutTax += prices.total_excluded;
                    acc.tax += prices.taxes_data.reduce((acc, tax) => (acc += tax.tax_amount), 0);
                }
                return acc;
            },
            { priceWithTax: 0, priceWithoutTax: 0, count: 0, tax: 0 }
        );
    }

    get backgroundImageUrl() {
        const imageId = this.config._self_ordering_image_background_ids[0];
        if (imageId) {
            return `url('/web/image/ir.attachment/${imageId}/raw')`;
        }
        return "none";
    }
}

export const selfOrderService = {
    dependencies: SelfOrder.serviceDependencies,
    async start(env, services) {
        return new SelfOrder(env, services).ready;
    },
};

registry.category("services").add("self_service", selfOrderService);

/**
 * @returns {SelfOrder}
 */
export function useSelf() {
    return useService("self_service");
}
