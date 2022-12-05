/* @odoo-module */

/**
 * @class ChannelMember
 * @typedef Data
 * @property {number} id
 * @property {number} partnerId
 */
export class ChannelMember {
    constructor(_state, { id, partnerId }) {
        Object.assign(this, { _state, id, partnerId });
    }

    get partner() {
        return this._state.partners[this.partnerId];
    }

    get im_status() {
        return this.partner.im_status;
    }

    get name() {
        return this.partner.name;
    }

    get avatarUrl() {
        return this.partner.avatarUrl;
    }

    get isCurrentUser() {
        return this.partner.isCurrentUser;
    }
}
