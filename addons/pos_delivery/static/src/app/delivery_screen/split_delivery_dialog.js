/* @odoo-module */

import { Component, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { Dialog } from "@web/core/dialog/dialog";

export class SplitDeliveryDialog extends Component {
    static template = "pos_delivery.SplitDeliveryDialog";
    static components = { Dialog };
    static props = {
        delivery: Object,
        onConfirm: Function,
        close: Function,
        title: { type: String, optional: true },
        description: { type: String, optional: true },
        confirmLabel: { type: String, optional: true },
        secondaryConfirmLabel: { type: String, optional: true },
        showBackorderInfo: { type: Boolean, optional: true },
    };

    setup() {
        this.state = useState({
            lineSplits: this.props.delivery.lines.map((line) => ({
                move_id: line.id,
                product_name: line.product_name,
                qty_demand: line.qty_demand,
                qty_delivered: line.qty_demand,
                uom_name: line.uom_name,
            })),
        });
    }

    onQtyChange(index, ev) {
        const value = parseFloat(ev.target.value) || 0;
        const max = this.state.lineSplits[index].qty_demand;
        this.state.lineSplits[index].qty_delivered = Math.min(Math.max(0, value), max);
    }

    get hasPartialDelivery() {
        return this.state.lineSplits.some((s) => s.qty_delivered < s.qty_demand);
    }

    _getSplits() {
        return this.state.lineSplits.map((s) => ({
            move_id: s.move_id,
            qty_delivered: s.qty_delivered,
        }));
    }

    async onConfirm() {
        await this.props.onConfirm(this._getSplits(), "immediate");
        this.props.close();
    }

    async onSecondaryConfirm() {
        await this.props.onConfirm(this._getSplits(), "prepare");
        this.props.close();
    }

    get title() {
        return this.props.title || _t("Split Delivery: %s", this.props.delivery.name);
    }

    get confirmLabel() {
        return this.props.confirmLabel || _t("Confirm Split");
    }

    get description() {
        return (
            this.props.description ||
            _t(
                "Set the quantity to deliver now for each item. Remaining quantities will be placed in a backorder."
            )
        );
    }
}
