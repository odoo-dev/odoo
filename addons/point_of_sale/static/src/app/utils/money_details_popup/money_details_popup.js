/** @odoo-module */

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { useState } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { floatIsZero } from "@web/core/utils/numbers";
import { NumericInput } from "@point_of_sale/app/generic_components/inputs/numeric_input/numeric_input";

export class MoneyDetailsPopup extends AbstractAwaitablePopup {
    static template = "point_of_sale.MoneyDetailsPopup";
    static components = { NumericInput };

    setup() {
        super.setup();
        this.pos = usePos();
        this.res_currency = this.pos.res_currency;
        this.state = useState({
            moneyDetails: this.props.moneyDetails
                ? { ...this.props.moneyDetails }
                : Object.fromEntries(this.pos.pos_bill.map((bill) => [bill.value, 0])),
        });
    }
    computeTotal(moneyDetails = this.state.moneyDetails) {
        return Object.entries(moneyDetails).reduce(
            (total, money) => total + money[0] * money[1],
            0
        );
    }
    //@override
    async getPayload() {
        let moneyDetailsNotes = !floatIsZero(this.computeTotal(), this.res_currency.decimal_places)
            ? "Money details: \n"
            : null;
        this.pos.pos_bill.forEach((bill) => {
            if (this.state.moneyDetails[bill.value]) {
                moneyDetailsNotes += `  - ${
                    this.state.moneyDetails[bill.value]
                } x ${this.env.utils.formatCurrency(bill.value)}\n`;
            }
        });
        return {
            total: this.computeTotal(),
            moneyDetailsNotes,
            moneyDetails: { ...this.state.moneyDetails },
            action: this.props.action,
        };
    }
    async cancel() {
        super.cancel();
        if (
            this.pos.pos_config.iface_cashdrawer &&
            this.pos.hardwareProxy.connectionInfo.status === "connected"
        ) {
            this.pos.logEmployeeMessage(this.props.action, "ACTION_CANCELLED");
        }
    }
}
