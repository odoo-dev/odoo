/** @odoo-module */

import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { patch } from "@web/core/utils/patch";

patch(PosOrderline, {
    extraFields: {
        ...(PosOrderline.extraFields || {}),
        e_wallet_program_id: {
            model: "pos.order.line",
            name: "e_wallet_program_id",
            relation: "loyalty.program",
            type: "many2one",
            local: true,
        },
        gift_barcode: {
            model: "pos.order.line",
            name: "gift_barcode",
            type: "char",
            local: true,
        },
        gift_card_id: {
            model: "pos.order.line",
            name: "gift_card_id",
            relation: "loyalty.card",
            type: "many2one",
            local: true,
        },
        reward_product_id: {
            model: "pos.order.line",
            name: "reward_product_id",
            relation: "product.product",
            type: "many2one",
            local: true,
        },
    },
});

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
        super.init_from_JSON(...arguments);
    },
    serialize() {
        const isNegativeCoupon = this.coupon_id?.id < 0;
        const json = super.serialize(...arguments);
        if (isNegativeCoupon) {
            json.coupon_id = undefined;
        }
        return json;
    },
    setOptions(options) {
        if (options.eWalletGiftCardProgram) {
            this.update({ e_wallet_program_id: options.eWalletGiftCardProgram });
        }
        if (options.giftBarcode) {
            this.update({ gift_barcode: options.giftBarcode });
        }
        if (options.giftCardId) {
            this.update({ gift_card_id: this.models["loyalty.card"].get(options.giftCardId) });
        }
        return super.setOptions(...arguments);
    },
    getEWalletGiftCardProgramType() {
        return this.e_wallet_program_id && this.e_wallet_program_id.program_type;
    },
    ignoreLoyaltyPoints({ program }) {
        return (
            ["gift_card", "ewallet"].includes(program.program_type) &&
            this.e_wallet_program_id?.id !== program.id
        );
    },
    isGiftCardOrEWalletReward() {
        const coupon = this.coupon_id;
        if (!coupon || !this.is_reward_line) {
            return false;
        }
        return ["ewallet", "gift_card"].includes(coupon.program_id?.program_type);
    },
    getGiftCardOrEWalletBalance() {
        const coupon = this.coupon_id;
        // TODO: find a better way to access `env.utils` from the model instances.
        return this.pos.env.utils.formatCurrency(coupon?.points || 0);
    },
    getDisplayClasses() {
        return {
            ...super.getDisplayClasses(),
            "fst-italic": this.is_reward_line,
        };
    },
});
