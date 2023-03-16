/* @odoo-module */

/**
 * @typedef Data
 * @property {import("@mail/discuss/core/thread_model").Thread} followedThread
 * @property {number} id
 * @property {Boolean} is_active
 * @property {import("@mail/discuss/core/partner_model").Data} partner
 */

export class Follower {
    /** @type {import("@mail/discuss/core/thread_model").Thread} */
    followedThread;
    /** @type {number} */
    id;
    /** @type {boolean} */
    isActive;
    /** @type {import("@mail/discuss/core/persona_model").Persona} */
    partner;
    /** @type {import("@mail/discuss/core/store_service").Store} */
    _store;

    /**
     * @returns {boolean}
     */
    get isEditable() {
        const hasWriteAccess = this.followedThread ? this.followedThread.hasWriteAccess : false;
        return this._store.user === this.partner
            ? this.followedThread.hasReadAccess
            : hasWriteAccess;
    }
}
