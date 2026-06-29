import { PaymentInterface } from "@point_of_sale/app/utils/payment/payment_interface";
import { rpc } from "@web/core/network/rpc";
import { patch } from "@web/core/utils/patch";

patch(PaymentInterface.prototype, {
    async callPaymentMethod(method, params) {
        params = {
            access_token: this.pos.access_token,
            args: params,
            kwargs: {},
        };
        return await rpc(`/kiosk/payment_method_action/${method}`, params, {
            silent: true,
        });
    },

    async callPaymentValidationMethod(method, params) {
        const order = this.pos.currentOrder;
        const paymentMethodId = params[0];
        const callParams = {
            access_token: this.pos.access_token,
            args: [Array.isArray(paymentMethodId) ? paymentMethodId : [paymentMethodId]],
            kwargs: {
                payment_method_name: method,
                payment_method_args: params.slice(1),
                order_id: order.id,
                order_access_token: order.access_token,
            },
        };
        return await rpc(`/kiosk/payment_method_action/payment_validation`, callParams, {
            silent: true,
        });
    },
});
