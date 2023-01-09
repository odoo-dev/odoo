/* @odoo-module */

import { createLocalId } from "./thread_model.create_local_id";

/**
 * @class ChannelMember
 * @typedef Data
 * @property {number} id
 * @property {number} partnerId
 * @property {number} guestId
 * @property {number} threadId
 */
export class ChannelMember {
    partnerId;
    guestId;
    threadId;
    typingTimer;
    /** @type {import("@mail/new/core/store_service").Store} */
    _store;

    get partner() {
        return this._store.partners[this.partnerId];
    }

    get guest() {
        return this._store.guests[this.guestId];
    }

    get persona() {
        return this.guest || this.partner;
    }

    get im_status() {
        return this.persona.im_status;
    }

    get name() {
        return this.persona.name;
    }

    get avatarUrl() {
        return this.persona.avatarUrl;
    }

    get isCurrentUser() {
        return this.persona.isCurrentUser;
    }

    get thread() {
        return this._store.threads[createLocalId("mail.channel", this.threadId)];
    }
}
