import OrderPaymentValidation from "@point_of_sale/app/utils/order_payment_validation";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

patch(OrderPaymentValidation.prototype, {
    async validateOrder(isForceValidate) {
        const pointChanges = {};
        const newCodes = [];
        for (const pe of Object.values(this.order.uiState.couponPointChanges)) {
            if (pe.coupon_id > 0) {
                pointChanges[pe.coupon_id] = pe.points;
            } else if (pe.barcode && !pe.giftCardId) {
                // New coupon with a specific code, validate that it does not exist
                newCodes.push(pe.barcode);
            }
        }
        for (const line of this.order._get_reward_lines()) {
            const couponId = line.coupon_id.id;
            if (couponId <= 0) {
                continue;
            }
            pointChanges[couponId] = (pointChanges[couponId] || 0) - line.points_cost;
        }
        if (!(await this.isOrderValid(isForceValidate))) {
            return;
        }
        // No need to do an rpc if no existing coupon is being used.
        if (Object.keys(pointChanges).length > 0 || newCodes.length) {
            try {
                const { successful, payload } = await this.pos.data.call(
                    "pos.order",
                    "validate_coupon_programs",
                    [[], pointChanges, newCodes]
                );
                // Payload may contain the points of the concerned coupons to be updated in case of error. (So that rewards can be corrected)
                if (payload?.updated_points) {
                    for (const [id, points] of Object.entries(payload.updated_points)) {
                        const coupon = this.pos.models["loyalty.card"].get(id);
                        if (coupon) {
                            coupon.points = points;
                        }
                    }
                }
                if (payload?.removed_coupons) {
                    for (const couponId of payload.removed_coupons) {
                        this.pos.models["loyalty.card"].get(couponId)?.delete();
                    }
                }
                if (!successful) {
                    this.pos.dialog.add(AlertDialog, {
                        title: _t("Error validating rewards"),
                        body: payload.message,
                    });
                    return;
                }
            } catch {
                // Do nothing with error, while this validation step is nice for error messages
                // it should not be blocking.
            }
        }
        await super.validateOrder(...arguments);
    },
});
