/* @odoo-module */

import { Thread } from "./thread_model";

/**
 * @class ChannelMember
 * @typedef Data
 * @property {number} id
 * @property {number} partnerId
 * @property {number} threadId
 */
export class ChannelMember {
    static insert(state, data) {
        let channelMember = state.channelMembers[data.id];
        if (!channelMember) {
            state.channelMembers[data.id] = new ChannelMember();
            channelMember = state.channelMembers[data.id];
            channelMember._state = state;
        }
        Object.assign(channelMember, {
            id: data.id,
            partnerId: data.partnerId,
            threadId: data.threadId ?? channelMember.threadId,
        });
        if (!channelMember.thread.channelMembers.includes(channelMember)) {
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
        return this._state.threads[
            Thread.createLocalId({ model: "mail.channel", id: this.threadId })
        ];
    }
}
