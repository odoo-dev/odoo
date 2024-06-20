/* global Sha1 */

import { useCashierSelector } from "@pos_hr/app/select_cashier_mixin";
import { registry } from "@web/core/registry";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Component, useState } from "@odoo/owl";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { useTime } from "@point_of_sale/app/utils/time_hook";

export class LoginScreen extends Component {
    static template = "pos_hr.LoginScreen";
    static props = {};
    static storeOnOrder = false;
    setup() {
        this.pos = usePos();
<<<<<<< saas-17.4
        this.notification = useService("notification");
        this.ui = useState(useService("ui"));
        this.selectCashier = useCashierSelector({
||||||| 4dadd6ebc14338231f6ee1e8cb87423a0119e028
        this.selectCashier = useCashierSelector({
=======
        this.cashierSelector = useCashierSelector({
>>>>>>> 966f31cb2cd3407653a2e508c366d2be7c01d559
            onCashierChanged: () => {
                this.cashierLogIn();
            },
            exclusive: true, // takes exclusive control on the barcode reader
        });
        this.time = useTime();
    }

    async displayEnterPinPopup() {
        this.dialog.add(NumberPopup, {
            title: _t("Connection with your PIN code"),
            formatDisplayedValue: (x) => x.replace(/./g, "•"),
            getPayload: (num) => {
                const employees = this.pos.models["hr.employee"].filter(
                    (emp) => emp._pin === Sha1.hash(num)
                );

                if (employees.length === 1) {
                    this.selectOneCashier(employees[0]);
                } else if (employees.length > 0) {
                    this.selectCashier(num);
                } else {
                    this.notification.add(_t("PIN not found"), {
                        type: "warning",
                        title: _t(`Wrong PIN`),
                    });
                }
            },
        });
    }

    selectOneCashier(employee) {
        this.pos.set_cashier(employee);
        this.cashierLogIn();
    }

    cashierLogIn() {
        this.pos.showScreen(this.pos.previousScreen || "ProductScreen");
        this.pos.hasLoggedIn = true;
    }
    async selectCashier() {
        return await this.cashierSelector();
    }
}

registry.category("pos_screens").add("LoginScreen", LoginScreen);
