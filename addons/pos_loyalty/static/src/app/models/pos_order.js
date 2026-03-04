import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";
import { floatIsZero } from "@web/core/utils/numbers";
import { _t } from "@web/core/l10n/translation";
import { loyaltyIdsGenerator } from "@pos_loyalty/app/services/pos_store";
const { DateTime } = luxon;

function _newRandomRewardCode() {
    return (Math.random() + 1).toString(36).substring(3);
}

let pointsForProgramsCountedRules = {};

/**
 * Calculate the number of free items based on the given number
 * of items `number_items` and the rule: buy `n` take `m`.
 *
 * e.g.
 *```
 *      rule: buy 2 take 1                    rule: buy 2 take 3
 *     +------------+--------+--------+      +------------+--------+--------+
 *     |number_items| charged|    free|      |number_items| charged|    free|
 *     +------------+--------+--------+      +------------+--------+--------+
 *     |           1|       1|       0|      |           1|       1|       0|
 *     |           2|       2|       0|      |           2|       2|       0|
 *     |           3|       2|       1|      |           3|       2|       1|
 *     |           4|       3|       1|      |           4|       2|       2|
 *     |           5|       4|       1|      |           5|       2|       3|
 *     |           6|       4|       2|      |           6|       3|       3|
 *     |           7|       5|       2|      |           7|       4|       3|
 *     |           8|       6|       2|      |           8|       4|       4|
 *     |           9|       6|       3|      |           9|       4|       5|
 *     |          10|       7|       3|      |          10|       4|       6|
 *     +------------+--------+--------+      +------------+--------+--------+
 * ```
 *
 * @param {number} numberItems number of items
 * @param {number} n items to buy
 * @param {number} m item for free
 * @returns {number} number of free items
 */
function computeFreeQuantity(numberItems, n, m) {
    const factor = Math.trunc(numberItems / (n + m));
    const free = factor * m;
    const charged = numberItems - free;
    // adjust the calculated free quantities
    const x = (factor + 1) * n;
    const y = x + (factor + 1) * m;
    const adjustment = x <= charged && charged < y ? charged - x : 0;
    return Math.floor(free + adjustment);
}

patch(PosOrder, {
    extraFields: {
        ...(PosOrder.extraFields || {}),
        _code_activated_coupon_ids: {
            model: "pos.order",
            name: "_code_activated_coupon_ids",
            relation: "loyalty.card",
            type: "one2many",
            local: true,
        },
    },
});

patch(PosOrder.prototype, {
    setup() {
        super.setup(...arguments);
        // Always start with invalid coupons so that coupon for this
        // order is properly assigned. @see _checkMissingCoupons
        this.invalidCoupons = true;
    },
    initState() {
        super.initState();
        this.uiState = {
            ...this.uiState,
            disabledRewards: this.uiState.disabledRewards || new Set(),
            codeActivatedProgramRules: this.uiState.codeActivatedProgramRules || [],
            couponPointChanges: this.uiState.couponPointChanges || {},
        };
        const oldCouponMapping = {};
        if (Object.keys(this.uiState.couponPointChanges).length === 0) {
            for (const [key, pe] of Object.entries(this.uiState.couponPointChanges)) {
                if (!this.models["loyalty.program"].get(pe.program_id)) {
                    // Remove points changes for programs that are not available anymore.
                    delete this.uiState.couponPointChanges[key];
                    continue;
                }
                if (pe.coupon_id > 0) {
                    continue;
                }
                const newId = loyaltyIdsGenerator();
                delete oldCouponMapping[pe.coupon_id];
                pe.coupon_id = newId;
                this.uiState.couponPointChanges[newId] = pe;
            }
        }
    },
    restoreState(vals) {
        super.restoreState(...arguments);
        this.uiState.disabledRewards = new Set(vals?.disabledRewards || []);
        for (const [key, pe] of Object.entries(this.uiState.couponPointChanges)) {
            if (!this.models["loyalty.program"].get(pe.program_id)) {
                delete this.uiState.couponPointChanges[key];
            }
        }
    },
    serializeState() {
        const state = super.serializeState(...arguments);
        if (this.uiState?.disabledRewards) {
            state.disabledRewards = [...(this.uiState.disabledRewards || [])];
        }
        return state;
    },

    /**
     * We need to update the rewards upon changing the partner as it may impact the points available
     *  for rewards.
     *
     * @override
     */
    setPartner(partner) {
        const oldPartner = this.getPartner();
        super.setPartner(partner);
        if (this.uiState.couponPointChanges && oldPartner !== this.getPartner()) {
            // Remove couponPointChanges for cards in is_nominative programs.
            // This makes sure that counting of points on loyalty and ewallet programs is updated after partner changes.
            const loyaltyProgramIds = new Set(
                this.models["loyalty.program"]
                    .filter((program) => program.is_nominative)
                    .map((program) => program.id)
            );
            for (const [key, pointChange] of Object.entries(this.uiState.couponPointChanges)) {
                if (loyaltyProgramIds.has(pointChange.program_id)) {
                    delete this.uiState.couponPointChanges[key];
                }
            }
        }
    },
    waitForPushOrder() {
        return (
            Object.keys(this.uiState.couponPointChanges || {}).length > 0 ||
            this._get_reward_lines().length ||
            super.waitForPushOrder(...arguments)
        );
    },
    //@override
    _getIgnoredProductIdsTotalDiscount() {
        const productIds = super._getIgnoredProductIdsTotalDiscount(...arguments);
        const giftCardPrograms = this.models["loyalty.program"].filter(
            (p) => p.program_type === "gift_card"
        );
        for (const program of giftCardPrograms) {
            const giftCardProductId = [...program.rule_ids[0].valid_product_ids][0];
            if (giftCardProductId) {
                productIds.push(giftCardProductId);
            }
        }
        return productIds;
    },
    getOrderlines() {
        const orderlines = super.getOrderlines(this, arguments);
        const rewardLines = [];
        const nonRewardLines = [];

        for (const line of orderlines) {
            if (line.is_reward_line) {
                rewardLines.push(line);
            } else {
                nonRewardLines.push(line);
            }
        }

        return [...nonRewardLines, ...rewardLines];
    },
    _get_reward_lines() {
        return this.lines?.filter((line) => line.is_reward_line) || [];
    },
    _get_regular_order_lines() {
        return (
            this.lines?.filter((line) => !line.is_reward_line && !line.refunded_orderline_id) || []
        );
    },
    getLastOrderline() {
        const orderLines = this.lines.filter((line) => !line.is_reward_line);
        return orderLines[orderLines.length - 1];
    },
    setPricelist(pricelist) {
        const oldPricelist = this.pricelist_id;
        super.setPricelist(...arguments);
        if (this.uiState.couponPointChanges && oldPricelist !== pricelist) {
            // Remove couponPointChanges for cards in no longer available programs.
            // This makes sure that counting of points on loyalty and ewallet programs is updated after pricelist changes.
            const loyaltyProgramIds = new Set(
                this.models["loyalty.program"]
                    .filter(
                        (program) =>
                            program.pricelist_ids.length > 0 &&
                            (!pricelist ||
                                !program.pricelist_ids.some((pl) => pl.id === pricelist.id))
                    )
                    .map((program) => program.id)
            );
            for (const [key, pointChange] of Object.entries(this.uiState.couponPointChanges)) {
                if (loyaltyProgramIds.has(pointChange.program_id)) {
                    delete this.uiState.couponPointChanges[key];
                }
            }
        }
    },
    _resetPrograms() {
        this.uiState.disabledRewards = new Set();
        this.uiState.codeActivatedProgramRules = [];
        this.uiState.couponPointChanges = {};
        for (const rewardLine of this.lines.filter((line) => line.is_reward_line)) {
            rewardLine.delete();
        }
        this._code_activated_coupon_ids = [["clear"]];
    },
    /**
     * Refreshes the currently applied rewards, if they are not applicable anymore they are removed.
     */
    _updateRewardLines() {
        if (!this.lines.length) {
            return false;
        }
        const rewardLines = this._get_reward_lines();
        if (!rewardLines.length) {
            return false;
        }

        const initialTotalQtys = rewardLines.reduce((sum, line) => sum + line.qty, 0);
        const initialTotalAmount = rewardLines.reduce(
            (sum, line) => sum + line.qty * line.price_unit,
            0
        );

        const productRewards = [];
        const otherRewards = [];
        const paymentRewards = [];
        const seenRewardIdentifiers = new Set();

        for (const line of rewardLines) {
            const claimedReward = {
                reward: line.reward_id,
                coupon_id: line.coupon_id?.id,
                args: {
                    product: line._reward_product_id,
                    price: line.price_unit,
                    quantity: line.qty,
                    cost: line.points_cost,
                },
                reward_identifier_code: line.reward_identifier_code,
            };
            const programType = claimedReward.reward.program_id.program_type;
            if (programType === "gift_card" || programType === "ewallet") {
                paymentRewards.push(claimedReward);
            } else if (claimedReward.reward.reward_type === "product") {
                productRewards.push(claimedReward);
            } else if (!seenRewardIdentifiers.has(claimedReward.reward_identifier_code)) {
                otherRewards.push(claimedReward);
                seenRewardIdentifiers.add(claimedReward.reward_identifier_code);
            }
            line.delete();
        }

        const allRewards = [...productRewards, ...otherRewards, ...paymentRewards];
        const allRewardsMerged = [];
        const rewardMergeMap = new Map();

        for (const reward of allRewards) {
            if (reward.reward.reward_type === "discount") {
                allRewardsMerged.push(reward);
            } else {
                const key = `${reward.reward.id}-${reward.args.price}`;
                if (rewardMergeMap.has(key)) {
                    const existingReward = rewardMergeMap.get(key);
                    existingReward.args.quantity += reward.args.quantity;
                    existingReward.args.cost += reward.args.cost;
                } else {
                    rewardMergeMap.set(key, reward);
                    allRewardsMerged.push(reward);
                }
            }
        }

        const codeActivatedCouponIds = new Set(this._code_activated_coupon_ids.map((c) => c.id));
        let changed = false;

        for (const claimedReward of allRewardsMerged) {
            const couponId = claimedReward.coupon_id;
            if (
                !codeActivatedCouponIds.has(couponId) &&
                !this.uiState.couponPointChanges[couponId]
            ) {
                continue;
            }

            const reward = claimedReward.reward;
            if (
                reward.program_id.program_type === "coupons" &&
                this.lines.some((l) => l.reward_id?.id === reward.id)
            ) {
                continue;
            }

            if (reward.reward_product_ids?.length === 1) {
                const sameProgramRewards = allRewardsMerged.filter(
                    (r) => r.reward.program_id.id === reward.program_id.id
                );
                if (sameProgramRewards.length === 1) {
                    delete claimedReward.args.quantity;
                }
            }

            this._applyReward(reward, couponId, claimedReward.args);

            if (!changed) {
                const newRewardLines = this._get_reward_lines();
                const totalQtysChanged =
                    newRewardLines.reduce((sum, line) => sum + line.qty, 0) !== initialTotalQtys;
                const totalAmountChanged =
                    newRewardLines.reduce((sum, line) => sum + line.qty * line.price_unit, 0) !==
                    initialTotalAmount;
                if (totalQtysChanged || totalAmountChanged) {
                    changed = true;
                }
            }
        }
        return changed;
    },
    /**
     * @typedef {{ won: number, spend: number, total: number, balance: number, name: string}} LoyaltyPoints
     * @typedef {{ couponId: number, program: object, points: LoyaltyPoints}} LoyaltyStat
     * @returns {Array<LoyaltyStat>}
     */
    getLoyaltyPoints() {
        // Pre-calculate spent points per coupon to avoid nested loops
        const spentByCoupon = {};
        for (const line of this._get_reward_lines()) {
            const couponId = line.coupon_id?.id;
            if (couponId) {
                spentByCoupon[couponId] = (spentByCoupon[couponId] || 0) + line.points_cost;
            }
        }

        const round = (val) => parseFloat(val.toFixed(2));
        const loyaltyPoints = {};
        for (const pointChange of Object.values(this.uiState.couponPointChanges)) {
            const { coupon_id, points, program_id } = pointChange;
            const program = this.models["loyalty.program"].get(program_id);
            if (!program || program.program_type !== "loyalty") {
                // Not a loyalty program or program not found, skip
                continue;
            }
            const loyaltyCard =
                this.models["loyalty.card"].get(coupon_id) ||
                this.models["loyalty.card"].create({
                    id: coupon_id,
                    points: 0,
                });
            const balance = loyaltyCard.points;
            const won = points - this._getPointsCorrection(program);
            const spent = spentByCoupon[coupon_id] || 0;
            const total = balance + won - spent;

            const name = program.portal_visible ? program.portal_point_name : _t("Points");
            loyaltyPoints[coupon_id] = {
                won: round(won),
                spent: round(spent),
                // Display total when order is ongoing.
                total: round(total),
                // Display balance when order is done.
                balance: round(balance),
                name,
                program,
            };
        }
        return Object.entries(loyaltyPoints).map(([couponId, points]) => ({
            couponId,
            points,
            program: points.program,
        }));
    },
    /**
     * The points in the couponPointChanges for free product reward is not correct.
     * It doesn't take into account the points from the `free` product. Use this method
     * to compute the necessary correction.
     * @param {*} program
     * @returns {number}
     */
    _getPointsCorrection(program) {
        const rewardLines = this.lines.filter((line) => line.is_reward_line);
        if (!this._canGenerateRewards(program, this.priceIncl, this.priceExcl)) {
            return 0;
        }
        let res = 0;
        const ProductPrice = this.models["decimal.precision"].find(
            (dp) => dp.name === "Product Price"
        );
        for (const rule of program.rule_ids) {
            for (const line of rewardLines) {
                const reward = line.reward_id;
                if (this._validForPointsCorrection(reward, line, rule)) {
                    if (rule.reward_point_mode === "money") {
                        res -= ProductPrice.round(
                            rule.reward_point_amount * line.prices.total_included
                        );
                    } else if (rule.reward_point_mode === "unit") {
                        res += rule.reward_point_amount * line.getQuantity();
                    }
                }
            }
        }
        return res;
    },
    /**
     * Checks if a reward line is valid for points correction.
     *
     * The function evaluates three conditions:
     * 1. The reward type must be 'product'.
     * 2. The reward line must be part of the rule.
     * 3. The reward line and the rule must be associated with the same program.
     */
    _validForPointsCorrection(reward, line, rule) {
        // Check if the reward type is free product
        if (reward.reward_type !== "product") {
            return false;
        }

        // Check if the rule's reward point mode is order then not valid for correction
        if (rule.reward_point_mode === "order") {
            return false;
        }

        // Check if the reward line is part of the rule
        if (!(rule.any_product || rule.validProductIds.has(line._reward_product_id?.id))) {
            return false;
        }

        // Check if the reward line and the rule are associated with the same program
        if (rule.program_id.id !== reward.program_id.id) {
            return false;
        }
        return true;
    },
    /**
     * @returns {number} The points that are left for the given coupon for this order.
     */
    _getRealCouponPoints(coupon_id) {
        let points = 0;
        const dbCoupon = this.models["loyalty.card"].get(coupon_id);
        if (dbCoupon) {
            points += dbCoupon.points;
        }
        Object.values(this.uiState.couponPointChanges).some((pe) => {
            if (pe.coupon_id === coupon_id) {
                if (this.models["loyalty.program"].get(pe.program_id).applies_on !== "future") {
                    points += pe.points;
                }
                // couponPointChanges is not supposed to have a coupon multiple times
                return true;
            }
            return false;
        });
        for (const line of this.getOrderlines()) {
            if (line.is_reward_line && line.coupon_id?.id === coupon_id) {
                points -= line.points_cost;
            }
        }
        return points;
    },
    _programIsApplicable(program) {
        if (
            program.trigger === "auto" &&
            !program.rule_ids.find(
                (rule) =>
                    rule.mode === "auto" || this.uiState.codeActivatedProgramRules.includes(rule.id)
            )
        ) {
            return false;
        }
        if (
            program.trigger === "with_code" &&
            !program.rule_ids.find((rule) =>
                this.uiState.codeActivatedProgramRules.includes(rule.id)
            )
        ) {
            return false;
        }
        if (program.is_nominative && !this.getPartner()) {
            return false;
        }
        if (program.date_from && program.date_from.startOf("day") > DateTime.now()) {
            return false;
        }
        if (program.date_to && program.date_to.endOf("day") < DateTime.now()) {
            return false;
        }
        if (program.limit_usage && program.total_order_count >= program.max_usage) {
            return false;
        }
        if (
            program.pricelist_ids.length > 0 &&
            (!this.pricelist_id ||
                !program.pricelist_ids.some((pl) => pl.id === this.pricelist_id.id))
        ) {
            return false;
        }
        return true;
    },
    isLineValidForLoyaltyPoints(line) {
        // This method should be overriden in other modules
        return true;
    },
    /**
     * Computes how much points each program gives.
     *
     * @param {Array} programs list of loyalty.program
     * @returns {Object} Containing the points gained per program
     */
    pointsForPrograms(programs) {
        const ProductPrice = this.models["decimal.precision"].find(
            (dp) => dp.name === "Product Price"
        );
        pointsForProgramsCountedRules = {};
        const orderLines = this.getOrderlines().filter((line) => !line.combo_parent_id);

        const linesPerRule = this._getLinesPerRule(orderLines, programs);
        const result = {};

        for (const program of programs) {
            let points = 0;
            const splitPoints = [];
            for (const rule of program.rule_ids) {
                if (
                    rule.mode === "with_code" &&
                    !this.uiState.codeActivatedProgramRules.includes(rule.id)
                ) {
                    continue;
                }

                const linesForRule = linesPerRule[rule.id] || [];
                const amountCheck = this._getRuleAmountCheck(linesForRule, rule);
                if (rule.minimum_amount > amountCheck) {
                    continue;
                }

                const { totalProductQty, orderedProductPaid } = this._computeRuleStats(
                    program,
                    rule,
                    orderLines
                );
                if (totalProductQty < rule.minimum_qty) {
                    continue;
                }

                if (!(program.id in pointsForProgramsCountedRules)) {
                    pointsForProgramsCountedRules[program.id] = [];
                }
                pointsForProgramsCountedRules[program.id].push(rule.id);

                if (
                    program.applies_on === "future" &&
                    rule.reward_point_split &&
                    rule.reward_point_mode !== "order"
                ) {
                    splitPoints.push(
                        ...this._computeSplitPoints(
                            program,
                            rule,
                            totalProductQty,
                            orderLines,
                            ProductPrice
                        )
                    );
                } else {
                    if (rule.reward_point_mode === "order") {
                        points += rule.reward_point_amount;
                    } else if (rule.reward_point_mode === "money") {
                        points += ProductPrice.round(rule.reward_point_amount * orderedProductPaid);
                    } else if (rule.reward_point_mode === "unit") {
                        points += rule.reward_point_amount * totalProductQty;
                    }
                }
            }
            const res = points || program.program_type === "coupons" ? [{ points }] : [];
            if (splitPoints.length) {
                res.push(...splitPoints);
            }
            result[program.id] = res;
        }
        return result;
    },

    _getLinesPerRule(orderLines, programs) {
        const linesPerRule = {};
        for (const line of orderLines) {
            const reward = line.reward_id;
            const isDiscount = reward?.reward_type === "discount";
            const rewardProgram = reward?.program_id;

            if (isDiscount && rewardProgram.trigger === "auto") {
                continue;
            }

            if (!this.isLineValidForLoyaltyPoints(line)) {
                continue;
            }

            for (const program of programs) {
                if (isDiscount && rewardProgram.id === program.id) {
                    continue;
                }
                for (const rule of program.rule_ids) {
                    if (rule.any_product || rule.validProductIds.has(line.product_id.id)) {
                        (linesPerRule[rule.id] || (linesPerRule[rule.id] = [])).push(line);
                    }
                }
            }
        }
        return linesPerRule;
    },

    _getRuleAmountCheck(linesForRule, rule) {
        const amountWithTax = linesForRule.reduce(
            (sum, line) =>
                sum +
                (line.combo_line_ids.length > 0
                    ? line.comboTotalPrice
                    : line.prices.total_included),
            0
        );
        const amountWithoutTax = linesForRule.reduce(
            (sum, line) =>
                sum +
                (line.combo_line_ids.length > 0
                    ? line.comboTotalPriceWithoutTax
                    : line.prices.total_excluded),
            0
        );
        return rule.minimum_amount_tax_mode === "incl" ? amountWithTax : amountWithoutTax;
    },

    _computeRuleStats(program, rule, orderLines) {
        let totalProductQty = 0;
        let orderedProductPaid = 0;

        for (const line of orderLines) {
            const isMatching =
                (!line.reward_product_id &&
                    (rule.any_product || rule.validProductIds.has(line.product_id.id))) ||
                (line.reward_product_id &&
                    (rule.any_product || rule.validProductIds.has(line._reward_product_id?.id)));

            if (isMatching && !line.ignoreLoyaltyPoints({ program })) {
                if (line.is_reward_line) {
                    const reward = line.reward_id;
                    if (
                        program.id === reward.program_id.id ||
                        ["gift_card", "ewallet"].includes(reward.program_id.program_type)
                    ) {
                        continue;
                    }
                }

                const lineQty = line._reward_product_id ? -line.getQuantity() : line.getQuantity();
                if (line.combo_line_ids.length > 0) {
                    orderedProductPaid += line.comboTotalPrice;
                } else {
                    orderedProductPaid += line.prices.total_included;
                }

                if (!line.is_reward_line) {
                    totalProductQty += lineQty;
                }
            }
        }
        return { totalProductQty, orderedProductPaid };
    },

    _computeSplitPoints(program, rule, totalProductQty, orderLines, ProductPrice) {
        const splitPoints = [];
        if (rule.reward_point_mode === "unit") {
            for (let i = 0; i < totalProductQty; i++) {
                splitPoints.push({ points: rule.reward_point_amount });
            }
        } else if (rule.reward_point_mode === "money") {
            for (const line of orderLines) {
                const isValidLine =
                    !line.is_reward_line &&
                    rule.validProductIds.has(line.product_id.id) &&
                    line.getQuantity() > 0 &&
                    !line.ignoreLoyaltyPoints({ program });

                if (isValidLine) {
                    const pointsPerUnit = ProductPrice.round(
                        (rule.reward_point_amount * line.prices.total_included) / line.getQuantity()
                    );
                    if (pointsPerUnit > 0) {
                        for (let i = 0; i < line.getQuantity(); i++) {
                            const point = { points: pointsPerUnit };
                            if (line._gift_barcode && line.getQuantity() === 1) {
                                point.barcode = line._gift_barcode;
                                point.giftCardId = line._gift_card_id.id;
                            }
                            splitPoints.push(point);
                        }
                    }
                }
            }
        }
        return splitPoints;
    },
    /**
     * @returns {Array} List of lines composing the global discount
     */
    _getGlobalDiscountLines() {
        return this.getOrderlines().filter(
            (line) => line.reward_id && line.reward_id.is_global_discount
        );
    },
    /**
     * Returns the number of product items in the order based on the given rule.
     * @param {*} rule
     */
    _computeNItems(rule) {
        return this._get_regular_order_lines().reduce((nItems, line) => {
            let increment = 0;
            if (rule.any_product || rule.validProductIds.has(line.product_id.id)) {
                increment = line.getQuantity();
            }
            return nItems + increment;
        }, 0);
    },
    /**
     * Checks whether this order is allowed to generate rewards
     * from the given coupon program.
     * @param {*} couponProgram
     */
    _canGenerateRewards(couponProgram, orderTotalWithTax, orderTotalWithoutTax) {
        for (const rule of couponProgram.rule_ids) {
            const amountToCompare =
                rule.minimum_amount_tax_mode == "incl" ? orderTotalWithTax : orderTotalWithoutTax;
            if (rule.minimum_amount > amountToCompare) {
                return false;
            }
            const nItems = this._computeNItems(rule);
            if (rule.minimum_qty > nItems) {
                return false;
            }
        }
        return true;
    },
    getClaimableRewards(coupon_id = false, program_id = false, auto = false) {
        const couponPointChanges = this.uiState.couponPointChanges;
        const excludedCouponIds = Object.keys(couponPointChanges)
            .filter((id) => couponPointChanges[id].manual && couponPointChanges[id].existing_code)
            .map((id) => couponPointChanges[id].coupon_id);

        const allCouponPrograms = Object.values(couponPointChanges)
            .filter((pe) => !excludedCouponIds.includes(pe.coupon_id))
            .map((pe) => ({
                program_id: pe.program_id,
                coupon_id: pe.coupon_id,
            }))
            .concat(
                this._code_activated_coupon_ids.map((coupon) => ({
                    program_id: coupon.program_id.id,
                    coupon_id: coupon.id,
                }))
            );

        // Pre-calculate points and existing reward counts to avoid O(N^2)
        const couponPoints = new Map();
        for (const cp of allCouponPrograms) {
            if (!couponPoints.has(cp.coupon_id)) {
                couponPoints.set(cp.coupon_id, this._getRealCouponPoints(cp.coupon_id));
            }
        }

        const existingRewardIds = new Set(
            this.lines.filter((l) => l.is_reward_line).map((l) => l.reward_id?.id)
        );

        const result = [];
        const totalWithTax = this.priceIncl;
        const totalWithoutTax = this.priceExcl;
        const totalIsZero = totalWithTax === 0;
        const globalDiscountLines = this._getGlobalDiscountLines();
        const globalDiscountReward = globalDiscountLines.length
            ? globalDiscountLines[0].reward_id.discount
            : 0;

        for (const couponProgram of allCouponPrograms) {
            const program = this.models["loyalty.program"].get(couponProgram.program_id);
            if (!program) {
                continue;
            }

            if (
                program.pricelist_ids.length > 0 &&
                (!this.pricelist_id ||
                    !program.pricelist_ids.some((pl) => pl.id === this.pricelist_id.id))
            ) {
                continue;
            }

            if (program.trigger === "with_code") {
                if (!this._canGenerateRewards(program, totalWithTax, totalWithoutTax)) {
                    continue;
                }
            }

            if (
                (coupon_id && couponProgram.coupon_id !== coupon_id) ||
                (program_id && couponProgram.program_id !== program_id)
            ) {
                continue;
            }

            const points = couponPoints.get(couponProgram.coupon_id);
            for (const reward of program.reward_ids) {
                if (points < reward.required_points) {
                    continue;
                }

                if (
                    reward.program_id.program_type === "coupons" &&
                    existingRewardIds.has(reward.id)
                ) {
                    continue;
                }

                if (auto && this.uiState.disabledRewards.has(reward.id)) {
                    continue;
                }

                if (reward.is_global_discount && reward.discount <= globalDiscountReward) {
                    continue;
                }

                if (reward.reward_type === "discount" && totalIsZero) {
                    continue;
                }

                let unclaimedQty;
                if (reward.reward_type === "product") {
                    if (!reward.multi_product) {
                        const product = reward.reward_product_id;
                        if (!product) {
                            continue;
                        }
                        unclaimedQty = this._computeUnclaimedFreeProductQty(
                            reward,
                            couponProgram.coupon_id,
                            product,
                            points
                        );
                    }
                    if (!unclaimedQty || unclaimedQty <= 0) {
                        continue;
                    }
                }
                result.push({
                    coupon_id: couponProgram.coupon_id,
                    reward: reward,
                    potentialQty: unclaimedQty,
                });
            }
        }
        return result;
    },
    /**
     * TODO JCB: make the second parameter not id, but the loyalty.card object itself.
     * Applies a reward to the order, `pos.updateRewards` is expected to be called right after.
     *
     * @param {loyalty.reward} reward
     * @param {Integer} coupon_id
     * @param {Object} args Reward options
     * @returns True if everything went right or an error message
     */
    _applyReward(reward, coupon_id, args) {
        if (this._getRealCouponPoints(coupon_id) < reward.required_points) {
            return _t("There are not enough points on the coupon to claim this reward.");
        }
        if (reward.is_global_discount) {
            const globalDiscountLines = this._getGlobalDiscountLines();
            if (globalDiscountLines.length) {
                const rewardId = globalDiscountLines[0].reward_id;
                if (rewardId != reward.id && rewardId.discount >= reward.discount) {
                    return _t("A better global discount is already applied.");
                } else if (rewardId != rewardId.id) {
                    for (const line of globalDiscountLines) {
                        line.delete();
                    }
                }
            }
        }
        args = args || {};
        const rewardLines = this._getRewardLineValues({
            reward: reward,
            coupon_id: coupon_id,
            product: args["product"] || null,
            price: args["price"] || null,
            quantity: args["quantity"] || null,
            cost: args["cost"] || null,
        });
        if (!Array.isArray(rewardLines)) {
            return rewardLines; // Returned an error.
        }
        if (!rewardLines.length) {
            return _t("The reward could not be applied.");
        }
        for (const rewardLine of rewardLines) {
            this.applyRewardLine(rewardLine);
        }
        return true;
    },
    applyRewardLine(rewardLine) {
        const prepareRewards = {
            ...rewardLine,
            reward_id: rewardLine.reward_id,
            coupon_id: this.models["loyalty.card"].get(rewardLine.coupon_id),
            tax_ids: rewardLine.tax_ids.map((tax) => ["link", tax]),
        };
        this.models["pos.order.line"].create({
            ...prepareRewards,
            order_id: this,
            price_type: "manual",
        });
    },
    /**
     * Checks if there are any existing manual changes or new coupon additions for the given coupon code
     */
    duplicateCouponChanges(code) {
        return Object.values(this.uiState.couponPointChanges).some(
            (change) =>
                (change.existing_code === code && change.manual) ||
                (change.code === code && change.coupon_id < 0)
        );
    },
    /**
     * Processes a gift card by creating a new gift card.
     *
     * @param {String} newGiftCardCode gift card code as a string if new gift card to be created.
     * @param {number} points number of points to assign to the gift card.
     */
    processGiftCard(newGiftCardCode, points, expirationDate) {
        const partner_id = this.partner_id?.id || false;
        const product_id = this.getSelectedOrderline().product_id.id;
        const program =
            this.getSelectedOrderline()._e_wallet_program_id ||
            this.models["loyalty.program"].find((p) => p.program_type === "gift_card");

        let couponId;
        const couponData = {
            program_id: program?.id,
            points: points,
            manual: true,
            product_id: product_id,
        };

        // Fetch all coupon_ids for the specified points and not manually created, that are associated with the gift card program
        const applicableCouponIds = Object.entries(this.uiState.couponPointChanges)
            .filter(
                ([key, change]) =>
                    change.points === points &&
                    change.program_id === program.id &&
                    change.product_id === product_id &&
                    !change.manual
            )
            .map(([key]) => key);

        if (newGiftCardCode) {
            couponId = applicableCouponIds.shift() || loyaltyIdsGenerator();
            couponData.coupon_id = couponId;
            couponData.code = newGiftCardCode;
            couponData.partner_id = partner_id;
            couponData.expiration_date = expirationDate;
        }

        this.uiState.couponPointChanges[couponId] = couponData;
    },
    /**
     * @param {loyalty.reward} reward
     * @returns the discountable and discountable per tax for this discount on order reward.
     */
    _getDiscountableOnOrder(reward) {
        let discountable = 0;
        const discountablePerTax = {};
        const isEwalletOrGiftCard = ["ewallet", "gift_card"].includes(
            reward.program_id.program_type
        );

        for (const line of this.getOrderlines()) {
            if (!line.getQuantity()) {
                continue;
            }
            const filteredTaxes = isEwalletOrGiftCard
                ? line.tax_ids
                : line.tax_ids.filter((t) => t.amount_type !== "fixed");
            const taxKey = filteredTaxes.map((t) => t.id).join(",");

            discountable += line.prices.total_included;
            discountablePerTax[taxKey] = (discountablePerTax[taxKey] || 0) + line.basePrice;
        }
        return { discountable, discountablePerTax };
    },
    /**
     * @param {loyalty.reward} reward
     * @returns the cheapest line from all the lines where the program is applicable
     */
    _getCheapestLine(reward) {
        const applicableProductIds = new Set(reward.all_discount_product_ids.map((p) => p.id));
        let cheapestLine = null;
        let minPrice = Infinity;

        for (const line of this.getOrderlines()) {
            if (
                !line.combo_parent_id &&
                !line.reward_id &&
                line.getQuantity() &&
                applicableProductIds.has(line.getProduct().id)
            ) {
                const pricePerQty = line.comboTotalPrice / line.qty;
                if (pricePerQty < minPrice) {
                    minPrice = pricePerQty;
                    cheapestLine = line;
                }
            }
        }
        return cheapestLine;
    },
    /**
     * @returns the discountable and discountable per tax for this discount on cheapest reward.
     */
    _getDiscountableOnCheapest(reward) {
        const cheapestLine = this._getCheapestLine(reward);
        if (!cheapestLine) {
            return { discountable: 0, discountablePerTax: {} };
        }
        const taxKey = cheapestLine.tax_ids.map((t) => t.id);
        return {
            discountable: cheapestLine.comboTotalBasePrice,
            discountablePerTax: Object.fromEntries([[taxKey, cheapestLine.comboTotalBasePrice]]),
        };
    },
    /**
     * @param {loyalty.reward} reward
     * @returns all lines to which the reward applies.
     */
    _getSpecificDiscountableLines(reward) {
        const discountableLines = [];
        const applicableProductIds = new Set(reward.all_discount_product_ids.map((p) => p.id));
        for (const line of this.getOrderlines()) {
            if (!line.getQuantity()) {
                continue;
            }
            if (
                applicableProductIds.has(line.getProduct().id) ||
                applicableProductIds.has(line._reward_product_id?.id)
            ) {
                discountableLines.push(line);
            }
        }
        return discountableLines;
    },
    /**
     * For a 'specific' type of discount it is more complicated as we have to make sure that we never
     *  discount more than what is available on a per line basis.
     * @param {loyalty.reward} reward
     * @returns the discountable and discountable per tax for this discount on specific reward.
     */
    _getDiscountableOnSpecific(reward) {
        const applicableProductIds = new Set(reward.all_discount_product_ids.map((p) => p.id));
        const linesToDiscount = [];
        const discountLinesPerReward = {};
        const orderLines = this.getOrderlines();
        const orderProductIds = new Set(orderLines.map((line) => line.product_id.id));
        const remainingAmountPerLine = {};

        for (const line of orderLines) {
            if (!line.getQuantity() || !line.price_unit) {
                continue;
            }
            remainingAmountPerLine[line.uuid] = line.prices.total_included;
            const productId = line.combo_parent_id?.product_id.id || line.getProduct().id;

            if (
                applicableProductIds.has(productId) ||
                (line._reward_product_id && applicableProductIds.has(line._reward_product_id.id))
            ) {
                linesToDiscount.push(line);
            } else if (line.reward_id) {
                const lineReward = line.reward_id;
                const lineRewardApplicableProductIds = new Set(
                    lineReward.all_discount_product_ids.map((p) => p.id)
                );
                const hasCommonProduct = [...lineRewardApplicableProductIds].some(
                    (id) => applicableProductIds.has(id) && orderProductIds.has(id)
                );

                if (
                    lineReward.id === reward.id ||
                    (hasCommonProduct &&
                        lineReward.reward_type === "discount" &&
                        lineReward.discount_mode !== "percent")
                ) {
                    linesToDiscount.push(line);
                }
                const rewardCode = line.reward_identifier_code;
                if (!discountLinesPerReward[rewardCode]) {
                    discountLinesPerReward[rewardCode] = [];
                }
                discountLinesPerReward[rewardCode].push(line);
            }
        }

        const cheapestLineForRewards = new Map();
        for (const items of Object.values(discountLinesPerReward)) {
            const lineReward = items[0].reward_id;
            if (lineReward.reward_type !== "discount") {
                continue;
            }
            let discountedLines = orderLines;
            if (lineReward.discount_applicability === "cheapest") {
                if (!cheapestLineForRewards.has(lineReward.id)) {
                    cheapestLineForRewards.set(lineReward.id, this._getCheapestLine(lineReward));
                }
                const cheapestLine = cheapestLineForRewards.get(lineReward.id);
                discountedLines = cheapestLine ? [cheapestLine] : [];
            } else if (lineReward.discount_applicability === "specific") {
                discountedLines = this._getSpecificDiscountableLines(lineReward);
            }

            if (!discountedLines.length) {
                continue;
            }

            if (lineReward.discount_mode === "percent") {
                const discount = lineReward.discount / 100;
                for (const line of discountedLines) {
                    if (line.reward_id) {
                        continue;
                    }
                    if (lineReward.discount_applicability === "cheapest") {
                        remainingAmountPerLine[line.uuid] *= 1 - discount / line.getQuantity();
                    } else {
                        remainingAmountPerLine[line.uuid] *= 1 - discount;
                    }
                }
            }
        }

        let discountable = 0;
        const discountablePerTax = {};
        for (const line of linesToDiscount) {
            const amount = remainingAmountPerLine[line.uuid];
            discountable += amount;
            const taxKey = line.tax_ids.map((t) => t.id);
            if (!discountablePerTax[taxKey]) {
                discountablePerTax[taxKey] = 0;
            }
            discountablePerTax[taxKey] += line.basePrice * (amount / line.prices.total_included);
        }
        return { discountable, discountablePerTax };
    },
    /**
     * @param {Object} args See `_applyReward`
     * @returns {Array} List of values to create the reward lines
     */
    _getRewardLineValues(args) {
        const reward = args["reward"];
        if (reward.reward_type === "discount") {
            return this._getRewardLineValuesDiscount(args);
        } else if (reward.reward_type === "product") {
            return this._getRewardLineValuesProduct(args);
        }
        // NOTE: we may reach this step if for some reason there is a free shipping reward
        return [];
    },
    /**
     * @param {Object} args See `_applyReward`
     * @returns {Array} List of values to create the discount lines
     */
    _getRewardLineValuesDiscount(args) {
        //LINK
        const reward = args["reward"];
        const coupon_id = args["coupon_id"];
        const rewardAppliesTo = reward.discount_applicability;
        let getDiscountable;
        if (rewardAppliesTo === "order") {
            getDiscountable = this._getDiscountableOnOrder.bind(this);
        } else if (rewardAppliesTo === "cheapest") {
            getDiscountable = this._getDiscountableOnCheapest.bind(this);
        } else if (rewardAppliesTo === "specific") {
            getDiscountable = this._getDiscountableOnSpecific.bind(this);
        }
        if (!getDiscountable) {
            return _t("Unknown discount type");
        }
        let { discountable, discountablePerTax } = getDiscountable(reward);
        discountable = Math.min(this.priceIncl, discountable);
        if (floatIsZero(discountable)) {
            return [];
        }
        let maxDiscount = reward.discount_max_amount || Infinity;
        if (reward.discount_mode === "per_point") {
            // Rewards cannot be partially offered to customers
            const points = ["ewallet", "gift_card"].includes(reward.program_id.program_type)
                ? this._getRealCouponPoints(coupon_id)
                : Math.floor(this._getRealCouponPoints(coupon_id) / reward.required_points) *
                  reward.required_points;
            maxDiscount = Math.min(maxDiscount, reward.discount * points);
        } else if (reward.discount_mode === "per_order") {
            maxDiscount = Math.min(maxDiscount, reward.discount);
        } else if (reward.discount_mode === "percent") {
            maxDiscount = Math.min(maxDiscount, discountable * (reward.discount / 100));
        }
        const rewardCode = _newRandomRewardCode();
        let pointCost = reward.clear_wallet
            ? this._getRealCouponPoints(coupon_id)
            : reward.required_points;
        if (reward.discount_mode === "per_point" && !reward.clear_wallet) {
            pointCost = Math.min(maxDiscount, discountable) / reward.discount;
        }
        // These are considered payments and do not require to be either taxed or split by tax
        const discountProduct = reward.discount_line_product_id;
        if (["ewallet", "gift_card"].includes(reward.program_id.program_type)) {
            const price = discountProduct.getTaxDetails({
                overridedValues: {
                    tax_ids: discountProduct.taxes_id,
                    price_unit: -Math.min(maxDiscount, discountable),
                    special_mode: "total_included",
                },
            });

            return [
                {
                    product_id: discountProduct,
                    price_unit: price.total_excluded,
                    qty: 1,
                    reward_id: reward,
                    is_reward_line: true,
                    coupon_id: coupon_id,
                    points_cost: pointCost,
                    reward_identifier_code: rewardCode,
                    tax_ids: discountProduct.taxes_id,
                },
            ];
        }

        const discountFactor = discountable ? Math.min(1, maxDiscount / discountable) : 1;
        const result = Object.entries(discountablePerTax).reduce((lst, entry) => {
            // Ignore 0 price lines
            if (!entry[1]) {
                return lst;
            }
            let taxIds = entry[0] === "" ? [] : entry[0].split(",").map((str) => parseInt(str));
            taxIds = this.models["account.tax"].filter((tax) => taxIds.includes(tax.id));

            lst.push({
                product_id: discountProduct,
                price_unit: -(Math.min(this.priceIncl, entry[1]) * discountFactor),
                qty: 1,
                reward_id: reward,
                is_reward_line: true,
                coupon_id: coupon_id,
                points_cost: 0,
                reward_identifier_code: rewardCode,
                tax_ids: taxIds,
            });
            return lst;
        }, []);
        if (result.length) {
            result[0]["points_cost"] = pointCost;
        }
        return result;
    },
    _isRewardProductPartOfRules(reward, product) {
        return (
            reward.program_id.rule_ids.filter(
                (rule) => rule.any_product || rule.validProductIds.has(product.id)
            ).length > 0
        );
    },
    /**
     * Tries to compute how many free product can be given out for the given product.
     * Contrary to sale_loyalty, the product must be in the order lines in order to give it out
     *  (resulting in discount lines for the product's value).
     * As such we need to approximate the effect of removing 1 quantity on the counting of points in order
     *  to avoid feedback loops between giving a product and it removing the required points for it.
     *
     * @param {loyalty.reward} reward
     * @param {Integer} coupon_id
     * @param {Product} product
     * @returns {Integer} Available quantity to be given as reward for the given product
     */
    _computeUnclaimedFreeProductQty(reward, coupon_id, product, remainingPoints) {
        const ProductPrice = this.models["decimal.precision"].find(
            (dp) => dp.name === "Product Price"
        );
        let claimed = 0;
        let available = 0;
        let shouldCorrectRemainingPoints = false;
        const rewardProductIds = new Set(reward.reward_product_ids.map((p) => p.id));
        const orderLines = this.getOrderlines();

        for (const line of orderLines) {
            const lineProductId = line.getProduct().id;
            if (rewardProductIds.has(product.id) && rewardProductIds.has(lineProductId)) {
                available += line.getQuantity();
            } else if (
                line._reward_product_id &&
                rewardProductIds.has(line._reward_product_id.id)
            ) {
                if (line.reward_id.id === reward.id) {
                    remainingPoints += line.points_cost;
                    claimed += line.getQuantity();
                } else {
                    shouldCorrectRemainingPoints = true;
                }
            }
        }
        let freeQty;
        if (reward.program_id.trigger == "auto") {
            if (
                this._isRewardProductPartOfRules(reward, product) &&
                reward.program_id.applies_on !== "future"
            ) {
                // OPTIMIZATION: Pre-calculate the factors for each reward-product combination during the loading.
                // For points not based on quantity, need to normalize the points to compute free quantity.
                const appliedRulesIds = this.uiState.couponPointChanges[coupon_id].appliedRules;
                const appliedRules =
                    appliedRulesIds !== undefined
                        ? reward.program_id.rule_ids.filter((rule) =>
                              appliedRulesIds.includes(rule.id)
                          )
                        : reward.program_id.rule_ids;
                let factor = 0;
                let orderPoints = 0;
                for (const rule of appliedRules) {
                    if (rule.any_product || rule.validProductIds.has(product.id)) {
                        if (rule.reward_point_mode === "order") {
                            orderPoints += rule.reward_point_amount;
                        } else if (rule.reward_point_mode === "money") {
                            factor += ProductPrice.round(
                                rule.reward_point_amount * product.lst_price
                            );
                        } else if (rule.reward_point_mode === "unit") {
                            factor += rule.reward_point_amount;
                        }
                    }
                }
                if (factor === 0) {
                    freeQty = Math.floor(
                        (remainingPoints / reward.required_points) * reward.reward_product_qty
                    );
                } else {
                    const correction = shouldCorrectRemainingPoints
                        ? this._getPointsCorrection(reward.program_id)
                        : 0;
                    freeQty = computeFreeQuantity(
                        (remainingPoints - correction - orderPoints) / factor,
                        reward.required_points / factor,
                        reward.reward_product_qty
                    );
                    freeQty += Math.floor(
                        (orderPoints / reward.required_points) * reward.reward_product_qty
                    );
                }
            } else {
                freeQty = Math.floor(
                    (remainingPoints / reward.required_points) * reward.reward_product_qty
                );
            }
        } else if (reward.program_id.trigger == "with_code") {
            freeQty = Math.floor(
                (remainingPoints / reward.required_points) * reward.reward_product_qty
            );
        }
        return Math.min(available, freeQty) - claimed;
    },
    _computePotentialFreeProductQty(reward, product, remainingPoints) {
        if (reward.program_id.trigger == "auto") {
            if (
                this._isRewardProductPartOfRules(reward, product) &&
                reward.program_id.applies_on !== "future"
            ) {
                // Compute the correction points once even if there are multiple reward lines.
                // This is because _getPointsCorrection is taking into account all the lines already.
                const claimedPoints = this._getPointsCorrection(reward.program_id);
                return Math.floor((remainingPoints - claimedPoints) / reward.required_points) > 0
                    ? reward.reward_product_qty
                    : 0;
            } else {
                return Math.floor(
                    (remainingPoints / reward.required_points) * reward.reward_product_qty
                );
            }
        } else if (reward.program_id.trigger == "with_code") {
            return Math.floor(
                (remainingPoints / reward.required_points) * reward.reward_product_qty
            );
        }
    },
    /**
     * @param {Object} args See `_applyReward`
     * @returns {Array} List of values to create the reward lines
     */
    _getRewardLineValuesProduct(args) {
        const reward = args["reward"];
        const product =
            reward.reward_product_ids.find((p) => p.id === args["product"]?.id) ||
            reward.reward_product_ids[0];

        const points = this._getRealCouponPoints(args["coupon_id"]);
        const unclaimedQty = this._computeUnclaimedFreeProductQty(
            reward,
            args["coupon_id"],
            product,
            points
        );
        if (unclaimedQty <= 0) {
            return _t("There are not enough products in the basket to claim this reward.");
        }
        const claimable_count = reward.clear_wallet
            ? 1
            : Math.min(
                  Math.ceil(unclaimedQty / reward.reward_product_qty),
                  Math.floor(points / reward.required_points)
              );
        const cost = reward.clear_wallet
            ? points
            : Math.min(claimable_count * reward.required_points, args["cost"] || Infinity);
        // In case the reward is the product multiple times, give it as many times as possible
        const freeQuantity = Math.min(
            unclaimedQty,
            reward.reward_product_qty * claimable_count,
            args["quantity"] || Infinity
        );
        return [
            {
                product_id: reward.discount_line_product_id,
                price_unit: -this.currency.round(
                    product.getPrice(this.pricelist_id, freeQuantity, 0, false, product)
                ),
                tax_ids: product.taxes_id,
                qty: freeQuantity,
                reward_id: reward,
                is_reward_line: true,
                _reward_product_id: product,
                coupon_id: args["coupon_id"],
                points_cost: cost,
                reward_identifier_code: _newRandomRewardCode(),
            },
        ];
    },
    isProgramsResettable() {
        const array = [
            this.uiState.disabledRewards,
            this.uiState.codeActivatedProgramRules,
            Object.keys(this.uiState.couponPointChanges),
            this._get_reward_lines(),
        ];
        return array.some((elem) => elem.length > 0);
    },
    removeOrderline(lineToRemove) {
        if (lineToRemove.is_reward_line) {
            // Remove any line that is part of that same reward aswell.
            const linesToRemove = this.getOrderlines().filter(
                (line) =>
                    line.reward_id === lineToRemove.reward_id &&
                    line.coupon_id === lineToRemove.coupon_id &&
                    line.reward_identifier_code === lineToRemove.reward_identifier_code
            );
            for (const line of linesToRemove) {
                line.delete();
            }
            return true;
        } else {
            return super.removeOrderline(lineToRemove);
        }
    },

    isSaleDisallowed(values, options) {
        // Allow gift cards to be added to a refund
        return super.isSaleDisallowed(values, options) && !options.eWalletGiftCardProgram;
    },
});
