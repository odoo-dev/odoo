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

    static insert(store, data) {
        let channelMember = store.channelMembers[data.id];
        if (!channelMember) {
            store.channelMembers[data.id] = new ChannelMember();
            channelMember = store.channelMembers[data.id];
            channelMember._store = store;
        }
        Object.assign(channelMember, {
            id: data.id,
            partnerId: data.partnerId ?? data.persona?.partner?.id,
            guestId: data.guestId ?? data.persona?.guest?.id,
            threadId: data.threadId ?? channelMember.threadId ?? data?.channel.id,
        });
        if (channelMember.thread && !channelMember.thread.channelMembers.includes(channelMember)) {
            channelMember.thread.channelMembers.push(channelMember);
        }
        return channelMember;
    }

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
