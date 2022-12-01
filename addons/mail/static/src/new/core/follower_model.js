/** @odoo-module */

import { Partner } from "@mail/new/core/partner_model";

export class Follower {
    /**
     * @param {import("@mail/new/messaging").Messaging['state']} state
     * @param {Object} data
     * @returns {Follower}
     */
    static insert(state, data) {
        let follower = state.followers[data.id];
        if (!follower) {
            state.followers[data.id] = new Follower();
            follower = state.followers[data.id];
        }
        Object.assign(follower, {
            followedThread: data.followedThread,
            id: data.id,
            isActive: data.is_active,
            partner: Partner.insert(state, data.partner),
            _state: state,
        });
        return follower;
    }

    get isEditable() {
        const hasWriteAccess = this.followedThread ? this.followedThread.hasWriteAccess : false;
        return this._state.user.partnerId === this.partner.id
            ? this.followedThread.hasReadAccess
            : hasWriteAccess;
    }
}
