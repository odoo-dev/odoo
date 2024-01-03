/** @odoo-module **/

export let nextId = -1;

export function loyaltyIdsGenerator() {
    return nextId--;
}

export class PosLoyaltyCard {
    /**
     * @param {string} code coupon code
     * @param {number} id id of loyalty.card, negative if it is cache local only
     * @param {number} program_id id of loyalty.program
     * @param {number} partner_id id of res.partner
     * @param {number} balance points on the coupon, not counting the order's changes
     * @param {string} expiration_date
     */
    constructor(code, id, program_id, partner_id, balance, expiration_date = false) {
        this.code = code;
        this.id = id || loyaltyIdsGenerator();
        this.program_id = program_id;
        this.partner_id = partner_id;
        this.balance = balance;
        this.expiration_date = expiration_date && new Date(expiration_date);
    }

    isExpired() {
        return this.expiration_date && this.expiration_date < new Date();
    }
}
