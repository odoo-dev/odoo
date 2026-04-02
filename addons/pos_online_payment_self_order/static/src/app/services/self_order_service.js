import { patch } from "@web/core/utils/patch";
import { SelfOrder } from "@pos_self/app/services/self_service";

patch(SelfOrder.prototype, {
    hasPaymentMethod() {
        if (
            this.config.self_ordering_mode === "mobile" &&
            this.config.self_order_online_payment_method_id
        ) {
            return true;
        }
        return super.hasPaymentMethod();
    },
    getExitRouteQueryParams() {
        let table = "";
        if (this.currentTable) {
            table = `&table_identifier=${this.currentTable.identifier}`;
        }

        return super.getExitRouteQueryParams() + table;
    },
    shouldUpdateLastOrderChange() {
        if (
            this.config.self_ordering_mode === "mobile" &&
            this.config.self_order_online_payment_method_id &&
            this.config.self_ordering_pay_after !== "meal"
        ) {
            // The last order change should not be updated in this case,
            // because the POS will print the prep order when the payment succeeds (see pos_store.js).
            return false;
        }
        return super.shouldUpdateLastOrderChange(...arguments);
    },
});
