/* @odoo-module */

import { Component, onMounted, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { AlertDialog, ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { deserializeDateTime, formatDateTime } from "@web/core/l10n/dates";
import { SplitDeliveryDialog } from "@pos_delivery/app/delivery_screen/split_delivery_dialog";

const FILTERS = [
    { key: "ready", label: _t("Ready"), icon: "fa-check-circle", color: "success" },
    { key: "done", label: _t("Done"), icon: "fa-archive", color: "secondary" },
    { key: "waiting", label: _t("Waiting"), icon: "fa-clock-o", color: "warning" },
    { key: "all", label: _t("All"), icon: "fa-list", color: "info" },
];

const STATE_LABELS = {
    draft: _t("Draft"),
    waiting: _t("Waiting"),
    confirmed: _t("Confirmed"),
    assigned: _t("Ready"),
    done: _t("Done"),
    cancel: _t("Cancelled"),
};

const STATE_BADGES = {
    draft: "bg-secondary",
    waiting: "bg-warning text-dark",
    confirmed: "bg-info",
    assigned: "bg-success",
    done: "bg-primary",
    cancel: "bg-danger",
};

const DELIVERY_TYPES = {
    ship_later: { label: _t("Ship Later"), icon: "fa-truck", class: "text-primary" },
    pickup: { label: _t("Pick Up Later"), icon: "fa-shopping-bag", class: "text-success" },
    click_collect: {
        label: _t("Click & Collect"),
        icon: "fa-shopping-bag",
        class: "text-success",
    },
    sale_order: { label: _t("Sale Order"), icon: "fa-file-text-o", class: "text-info" },
    internal: { label: _t("Transfer"), icon: "fa-exchange", class: "text-warning" },
    other: { label: _t("Other"), icon: "fa-tag", class: "text-secondary" },
};

export class DeliveryScreen extends Component {
    static template = "pos_delivery.DeliveryScreen";
    static components = {};
    static storeOnOrder = false;
    static props = { orderUuid: { type: String, optional: true } };

    setup() {
        this.pos = usePos();
        this.ui = useService("ui");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        this.filters = FILTERS;
        this.state = useState({
            deliveries: [],
            selectedDeliveryId: null,
            activeFilter: "ready",
            searchTerm: "",
            loading: false,
        });
        onMounted(() => this.fetchDeliveries());
    }

    // ──────────────── Data ────────────────

    async fetchDeliveries() {
        this.state.loading = true;
        try {
            const deliveries = await this._rpc("search_pos_deliveries", [
                this.pos.config.id,
                {
                    state: this.state.activeFilter,
                    search_term: this.state.searchTerm || false,
                },
            ]);
            this.state.deliveries = (deliveries || []).sort((a, b) => b.id - a.id);
            this._autoSelectDelivery();
        } catch {
            this.notification.add(_t("Failed to load deliveries"), { type: "danger" });
        } finally {
            this.state.loading = false;
        }
    }

    _autoSelectDelivery() {
        const ids = new Set(this.state.deliveries.map((d) => d.id));
        if (!this.state.selectedDeliveryId || !ids.has(this.state.selectedDeliveryId)) {
            this.state.selectedDeliveryId =
                this.state.deliveries.length > 0 ? this.state.deliveries[0].id : null;
        }
    }

    async _rpc(method, args) {
        return this.pos.data.call("stock.picking", method, args);
    }

    _showError(title, error) {
        this.dialog.add(AlertDialog, {
            title,
            body: error?.data?.message || error?.message || error || _t("An error occurred."),
        });
    }

    // ──────────────── UI Events ────────────────

    get selectedDelivery() {
        return this.state.deliveries.find((d) => d.id === this.state.selectedDeliveryId) || null;
    }

    selectDelivery(delivery) {
        this.state.selectedDeliveryId = delivery.id;
    }

    async onFilterClick(filterKey) {
        this.state.activeFilter = filterKey;
        this.state.selectedDeliveryId = null;
        await this.fetchDeliveries();
    }

    onSearch(ev) {
        this.state.searchTerm = ev.target.value;
    }

    onSearchKeydown(ev) {
        if (ev.key === "Enter") {
            this.fetchDeliveries();
        }
    }

    async onClearSearch() {
        this.state.searchTerm = "";
        await this.fetchDeliveries();
    }

    // ──────────────── Actions ────────────────

    async onCheckAvailability() {
        const delivery = this.selectedDelivery;
        if (!delivery) {
            return;
        }
        try {
            const result = await this._rpc("action_assign_pos_delivery", [delivery.id]);
            if (result.success) {
                this.notification.add(_t("Availability checked for %s", result.picking_name), {
                    type: "info",
                });
                await this.fetchDeliveries();
            } else {
                this._showError(_t("Availability Check"), result.error);
            }
        } catch (error) {
            this._showError(_t("Error"), error);
        }
    }

    async onValidateDelivery() {
        const delivery = this.selectedDelivery;
        if (!delivery) {
            return;
        }
        const body = this.isPartial
            ? _t("WARNING: This delivery is INCOMPLETE (some items are missing). Validate anyway?")
            : _t("Mark all items in %s as delivered to %s?", delivery.name, delivery.partner_name);

        this.dialog.add(ConfirmationDialog, {
            title: _t("Validate Delivery"),
            body,
            confirm: async () => {
                try {
                    const result = await this._rpc("validate_pos_delivery", [delivery.id]);
                    if (result.success) {
                        this.notification.add(_t("Delivery %s validated!", result.picking_name), {
                            type: "success",
                        });
                        await this.fetchDeliveries();
                    } else if (result.error) {
                        this._showError(_t("Validation Error"), result.error);
                    }
                } catch (error) {
                    this._showError(_t("Validation Error"), error);
                }
            },
        });
    }

    async onSplitDelivery() {
        const delivery = this.selectedDelivery;
        if (!delivery) {
            return;
        }
        if (delivery.state === "done") {
            this._showError(
                _t("Already Done"),
                _t("This delivery is already completed and cannot be split.")
            );
            return;
        }
        this.dialog.add(SplitDeliveryDialog, {
            delivery,
            onConfirm: async (lineSplits) => {
                try {
                    const result = await this._rpc("split_pos_delivery", [delivery.id, lineSplits]);
                    if (result.success) {
                        let msg = _t("Delivery %s partially validated!", result.picking_name);
                        if (result.backorder) {
                            msg +=
                                " " +
                                _t(
                                    "Backorder %s created for remaining items.",
                                    result.backorder.name
                                );
                        }
                        this.notification.add(msg, { type: "success" });
                        await this.fetchDeliveries();
                    }
                } catch (error) {
                    this._showError(_t("Split Error"), error);
                }
            },
        });
    }

    async onExchange() {
        const delivery = this.selectedDelivery;
        if (!delivery?.partner_id) {
            this._showError(
                _t("Cannot Exchange"),
                _t("Select a completed delivery with a customer to create an exchange.")
            );
            return;
        }
        this.dialog.add(SplitDeliveryDialog, {
            delivery,
            title: _t("Exchange: Select Items"),
            confirmLabel: _t("Immediate Exchange"),
            secondaryConfirmLabel: _t("Prepare Exchange"),
            showBackorderInfo: false,
            description: _t(
                "Select the items and quantities to exchange. Use 'Immediate' if items are in stock, or 'Prepare' to create a pending delivery."
            ),
            onConfirm: async (lineSplits, mode) => {
                const lines = lineSplits
                    .filter((s) => s.qty_delivered > 0)
                    .map((s) => ({
                        product_id: delivery.lines.find((l) => l.id === s.move_id)?.product_id,
                        qty: s.qty_delivered,
                    }))
                    .filter((l) => l.product_id);

                if (!lines.length) {
                    this.notification.add(_t("Please select at least one item to exchange."), {
                        type: "danger",
                    });
                    return;
                }
                try {
                    const immediate = mode === "immediate";
                    const result = await this._rpc("create_warehouse_delivery", [
                        delivery.partner_id,
                        lines,
                        false,
                        immediate,
                    ]);
                    if (result.success) {
                        const msg = immediate
                            ? _t(
                                  "Exchange %s validated for %s",
                                  result.picking_name,
                                  delivery.partner_name
                              )
                            : _t(
                                  "Exchange %s prepared for %s",
                                  result.picking_name,
                                  delivery.partner_name
                              );
                        this.notification.add(msg, { type: "success" });
                        await this.fetchDeliveries();
                    } else if (result.error) {
                        this._showError(_t("Exchange Error"), result.error);
                    }
                } catch (error) {
                    this._showError(_t("Exchange Error"), error);
                }
            },
        });
    }

    // ──────────────── Computed ────────────────

    get canValidate() {
        return this.selectedDelivery?.state === "assigned";
    }

    get canCheckAvailability() {
        return ["waiting", "confirmed"].includes(this.selectedDelivery?.state);
    }

    get canSplit() {
        const d = this.selectedDelivery;
        return d?.state === "assigned" && d.lines.length > 0;
    }

    get canExchange() {
        const d = this.selectedDelivery;
        return d?.state === "done" && d.partner_id;
    }

    get isPartial() {
        const d = this.selectedDelivery;
        if (!d || d.state === "done" || d.state === "cancel") {
            return false;
        }
        return d.lines.some((l) => l.qty_reserved < l.qty_demand);
    }

    // ──────────────── Formatters ────────────────

    getStateLabel(state) {
        return STATE_LABELS[state] || state;
    }

    getDeliveryTypeInfo(type) {
        return DELIVERY_TYPES[type] || DELIVERY_TYPES.other;
    }

    getStateBadgeClass(state) {
        return STATE_BADGES[state] || "bg-secondary";
    }

    formatDate(dateStr) {
        return dateStr ? formatDateTime(deserializeDateTime(dateStr)) : "";
    }
}

registry.category("pos_pages").add("DeliveryScreen", {
    name: "DeliveryScreen",
    component: DeliveryScreen,
    route: `/pos/ui/${odoo.pos_config_id}/deliveries`,
    params: {},
});
