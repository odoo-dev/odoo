/** @odoo-module */

/**
 * @class Partner
 */
export class Partner {
    /**
     * @type {Number}
     */
    id;
    /**
     * @type {string}
     */
    name;
    /**
     * @type {import("./messaging_hook").Messaging};
     */
    messaging;

    /**
     * @param {object} env
     * @param {object} data
     */
    constructor(env, data) {
        this.messaging = env.services["mail.messaging"];
        Object.assign(this, data);
        if (this.id in this.messaging.partners) {
            return this.messaging.partners[data.id];
        }
        this.messaging.partners[this.id] = this;
        this.messaging.updateImStatusRegistration(this);
    }

    get avatarUrl() {
        return `/mail/channel/1/partner/${this.id}/avatar_128`;
    }
}
