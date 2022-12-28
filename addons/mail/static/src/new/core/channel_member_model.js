/* @odoo-module */

import { createLocalId } from "./thread_model.create_local_id";

/**
 * @class ChannelMember
 * @typedef Data
 * @property {number} id
 * @property {number} partnerId
 * @property {number} threadId
 */
export class ChannelMember {
    partnerId;
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

    get thread() {
        return this._state.threads[createLocalId("mail.channel", this.threadId)];
    }
}
