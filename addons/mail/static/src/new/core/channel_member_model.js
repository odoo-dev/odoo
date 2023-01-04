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

    static insert(state, data) {
        let channelMember = state.channelMembers[data.id];
        if (!channelMember) {
            state.channelMembers[data.id] = new ChannelMember();
            channelMember = state.channelMembers[data.id];
            channelMember._state = state;
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
        return this._state.partners[this.partnerId];
    }

    get guest() {
        return this._state.guests[this.guestId];
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
        return this._state.threads[createLocalId("mail.channel", this.threadId)];
    }
}
