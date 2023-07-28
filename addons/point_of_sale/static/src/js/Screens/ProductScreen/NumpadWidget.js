/** @odoo-module */

import { useService } from "@web/core/utils/hooks";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/pos_hook";

/**
 * @prop {'quantity' | 'price' | 'discount'} activeMode
 * @prop {Array<'quantity' | 'price' | 'discount'>} disabledModes
 * @prop {boolean} disableSign
 */
export class NumpadWidget extends Component {
    static template = "NumpadWidget";
    static defaultProps = {
        disabledModes: [],
        disableSign: false,
    };
    setup() {
        this.pos = usePos();
        this.numberBuffer = useService("number_buffer");
        this.localization = useService("localization");
    }
    get hasPriceControlRights() {
        return (
            this.pos.globalState.cashierHasPriceControlRights() &&
            !this.props.disabledModes.includes("price")
        );
    }
    get hasManualDiscount() {
        return (
            this.pos.globalState.config.manual_discount &&
            !this.props.disabledModes.includes("discount")
        );
    }
    changeMode(mode) {
        if (!this.hasPriceControlRights && mode === "price") {
            return;
        }
        if (!this.hasManualDiscount && mode === "discount") {
            return;
        }
        this.numberBuffer.capture();
        this.numberBuffer.reset();
        this.pos.globalState.numpadMode = mode;
    }
    sendInput(key) {
        this.numberBuffer.sendKey(key);
    }
    get decimalSeparator() {
        return this.localization.decimalPoint;
    }
}
