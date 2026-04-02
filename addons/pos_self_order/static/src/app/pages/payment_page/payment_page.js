import { onMounted } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { PaymentInterface } from "@pos_self/app/components/payment_interface/payment_interface";

// This component is only use in Kiosk mode
export class PaymentPage extends PaymentInterface {
    static template = "pos_self_order.PaymentPage";

    setup() {
        super.setup(...arguments);
        this.selfOrder.isOrder();
        this.router = useService("router");

        onMounted(() => {
            if (this.selfOrder.models["pos.payment.method"].length === 1) {
                this.selectMethod(this.selfOrder.models["pos.payment.method"].getFirst().id);
            }
        });
    }

    back() {
        this.selfOrder.currentOrder.uiState.lineChanges = {};
        this.router.back();
    }

    get paymentRoute() {
        return `/kiosk/payment/${this.selfOrder.config.id}/kiosk`;
    }
}
