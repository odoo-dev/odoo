/* @odoo-module */

import { createLocalId } from "./thread_model.create_local_id";

/**
 * @class ChannelMember
 * @typedef Data
 * @property {number} id
 * @property {string} personaLocalId
 * @property {number} threadId
 */
export class ChannelMember {
    personaLocalId;
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
        return this._store.personas[this.personaLocalId];
    }

    set persona(persona) {
        this.personaLocalId = persona?.localId;
    }

    get im_status() {
        return this.persona.im_status;
    }

    get name() {
        return this.persona.name;
    }

    get avatarUrl() {
        if (this.persona.partner) {
            return `/mail/channel/${this.thread.id}/partner/${this.persona.partner.id}/avatar_128`;
        }
        if (this.persona.guest) {
            return `/mail/channel/${this.thread.id}/guest/${this.persona.guest.id}/avatar_128?unique=${this.persona.guest.name}`;
        }
        return "";
    }

    get isCurrentUser() {
        return this.persona.partner?.isCurrentUser;
    }

    get thread() {
        return this._store.threads[createLocalId("mail.channel", this.threadId)];
    }
}
