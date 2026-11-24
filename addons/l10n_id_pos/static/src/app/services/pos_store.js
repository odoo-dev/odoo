import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        // Callbacks of the open QR popups, called with the uuid of the paid order
        this.l10nIdQrisPaidCallbacks = new Set();
        this.data.connectWebSocket("L10N_ID_QRIS_PAID", ({ uuid }) => {
            for (const callback of this.l10nIdQrisPaidCallbacks) {
                callback(uuid);
            }
        });
    },

    getQRCodeValueContext(payment) {
        return {
            ...super.getQRCodeValueContext(payment),
            qris_model: "pos.order",
            qris_model_id: payment.pos_order_id.uuid,
        };
    },

    async showQR(payment) {
        const qrisPayments = payment.pos_order_id.payment_ids.filter(
            (p) => p.payment_method_id.qr_code_method === "id_qr"
        );
        if (payment.payment_method_id.qr_code_method === "id_qr" && qrisPayments.length === 1) {
            const isPaid = await this.data
                .call("pos.payment.method", "l10n_id_qris_is_paid", [
                    [payment.payment_method_id.id],
                    payment.pos_order_id.uuid,
                    payment.amount,
                ])
                .catch(() => false);
            if (isPaid) {
                return true;
            }
        }
        return super.showQR(...arguments);
    },
});
