import { useState } from "@web/owl2/utils";
import { Component, onWillUnmount } from "@odoo/owl";
import { useSelf } from "@pos_self/app/services/self_service";
import { rpc } from "@web/core/network/rpc";

// This component is only use in Kiosk mode
export class PaymentInterface extends Component {
    static props = {};

    setup() {
        this.selfOrder = useSelf();
        this.state = useState({
            selection: true,
            paymentMethodId: null,
        });

        onWillUnmount(() => {
            this.selfOrder.paymentError = false;
        });
    }

    selectMethod(methodId) {
        this.state.selection = false;
        this.state.paymentMethodId = methodId;
        this.startPayment();
    }

    get selectedPaymentMethod() {
        return this.selfOrder.models["pos.payment.method"].find(
            (p) => p.id === this.state.paymentMethodId
        );
    }

    get paymentRoute() {
        return "";
    }

    // this function will be override by pos_online_payment_self_order module
    // in mobile is the only available payment method
    async startPayment() {
        this.selfOrder.paymentError = false;
        try {
            if (this.selectedPaymentMethod.payment_interface) {
                const result = this.selfOrder.currentOrder.addPaymentline(
                    this.selectedPaymentMethod
                );
                if (!result.status) {
                    throw new Error(`Adding payment line failed: ${result.data}`);
                }
                const newPaymentLine = result.data;
                try {
                    const paymentSuccessful = await newPaymentLine.pay();
                    if (!paymentSuccessful) {
                        throw new Error("Payment terminal payment failed");
                    }
                } catch (err) {
                    this.selfOrder.currentOrder.removePaymentline(newPaymentLine);
                    throw err;
                }
            }
            await rpc(this.paymentRoute, {
                order: this.selfOrder.currentOrder.serializeForORM(),
                access_token: this.selfOrder.access_token,
                payment_method_id: this.state.paymentMethodId,
            });
        } catch (error) {
            this.selfOrder.handleErrorNotification(error);
            this.selfOrder.paymentError = true;
        }
    }
}
