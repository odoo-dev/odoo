/* @odoo-module */

import { Partner } from "@mail/new/core/partner_model";

/**
 * @typedef Data
 * @property {import("@mail/new/core/thread_model").Thread} followedThread
 * @property {number} id
 * @property {Boolean} is_active
 * @property {import("@mail/new/core/partner_model").Data} partner
 */

export class Follower {
    /** @type {import("@mail/new/core/thread_model").Thread} */
    followedThread;
    /** @type {number} */
    id;
    /** @type {boolean} */
    isActive;
    /** @type {import("@mail/new/core/partner_model").Partner} */
    partner;
    /** @type {import("@mail/new/core/store_service").Store} */
    _store;

    /**
     * @param {import("@mail/new/core/store_service").Store} store
     * @param {import("@mail/new/core/follower_model").Data} data
     * @returns {import("@mail/new/core/follower_model").Follower}
     */
    static insert(store, data) {
        let follower = store.followers[data.id];
        if (!follower) {
            store.followers[data.id] = new Follower();
            follower = store.followers[data.id];
        }
        Object.assign(follower, {
            followedThread: data.followedThread,
            id: data.id,
            isActive: data.is_active,
            partner: Partner.insert(store, data.partner),
            _store: store,
        });
        if (!follower.followedThread.followers.includes(follower)) {
            follower.followedThread.followers.push(follower);
        }
        return follower;
    }

    delete() {
        const index = this.followedThread.followers.indexOf(this);
        if (index !== -1) {
            this.followedThread.followers.splice(index, 1);
        }
        delete this._store.followers[this.id];
    }

    /**
     * @returns {boolean}
     */
    get isEditable() {
        const hasWriteAccess = this.followedThread ? this.followedThread.hasWriteAccess : false;
        return this._store.user.partnerId === this.partner.id
            ? this.followedThread.hasReadAccess
            : hasWriteAccess;
    }
}
