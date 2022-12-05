/** @odoo-module */

/**
 * @typedef Data
 * @property {number} id
 * @property {string} name
 */

export class Partner {
    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {import("@mail/new/core/partner_model").Data} data
     * @returns {import("@mail/new/core/partner_model").Partner}
     */
    static insert(state, data) {
        if (data.id in state.partners) {
            return state.partners[data.id];
        }
        let partner = new Partner(state, data);
        state.partners[data.id] = partner;
        // return reactive version
        partner = state.partners[data.id];
        if (
            partner.im_status !== "im_partner" &&
            !partner.is_public &&
            !state.registeredImStatusPartners.includes(partner.id)
        ) {
            state.registeredImStatusPartners.push(partner.id);
        }
        // return reactive version
        return partner;
    }

    constructor(state, { id, name }) {
        this._state = state;
        Object.assign(this, { id, name, im_status: null });
    }

    get avatarUrl() {
        return `/mail/channel/1/partner/${this.id}/avatar_128`;
    }

    get nameOrDisplayName() {
        return this.name || this.display_name;
    }

    get isCurrentUser() {
        return this.id !== this._state.user.partnerId;
    }
}
