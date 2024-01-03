/** @odoo-module */

import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { patch } from "@web/core/utils/patch";

// FIXME use of pos variable
patch(PosOrderline.prototype, {
    export_as_JSON() {
        const result = super.export_as_JSON(...arguments);
        result.is_reward_line = this.is_reward_line;
        result.reward_id = this.reward_id;
        result.reward_product_id = this.reward_product_id;
        result.coupon_id = this.coupon_id;
        result.reward_identifier_code = this.reward_identifier_code;
        result.points_cost = this.points_cost;
        result.giftBarcode = this.giftBarcode;
        result.giftCardId = this.giftCardId;
        result.eWalletGiftCardProgramId = this.eWalletGiftCardProgram
            ? this.eWalletGiftCardProgram.id
            : null;
        return result;
    },
    init_from_JSON(json) {
        if (json.is_reward_line) {
            this.is_reward_line = json.is_reward_line;
            this.reward_id = json.reward_id;
            this.reward_product_id = json.reward_product_id;
            // Since non existing coupon have a negative id, of which the counter is lost upon reloading
            //  we make sure that they are kept the same between after a reload between the order and the lines.
            this.coupon_id = this.order_id.oldCouponMapping[json.coupon_id] || json.coupon_id;
            this.reward_identifier_code = json.reward_identifier_code;
            this.points_cost = json.points_cost;
        }
        this.giftBarcode = json.giftBarcode;
        this.giftCardId = json.giftCardId;
        this.eWalletGiftCardProgram = this.models["loyalty.program"].get(
            json.eWalletGiftCardProgramId
        );
        super.init_from_JSON(...arguments);
    },
    getEWalletGiftCardProgramType() {
        return this.eWalletGiftCardProgram && this.eWalletGiftCardProgram.program_type;
    },
    ignoreLoyaltyPoints({ program }) {
        return (
            ["gift_card", "ewallet"].includes(program.program_type) &&
            this.eWalletGiftCardProgram &&
            this.eWalletGiftCardProgram.id !== program.id
        );
    },
    isGiftCardOrEWalletReward() {
        const coupon = this.pos.couponCache[this.coupon_id];
        if (!coupon || !this.is_reward_line) {
            return false;
        }
        const program = this.models["loyalty.program"].get(coupon.program_id);
        return ["ewallet", "gift_card"].includes(program.program_type);
    },
    getGiftCardOrEWalletBalance() {
        const coupon = this.pos.couponCache[this.coupon_id];
        return this.env.utils.formatCurrency(coupon?.balance || 0);
    },
    getDisplayClasses() {
        return {
            ...super.getDisplayClasses(),
            "fst-italic": this.is_reward_line,
        };
    },
});
