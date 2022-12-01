/** @odoo-module */

import { Composer } from "./composer_model";
import { Partner } from "./partner_model";

export class Thread {
    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {Object} data
     * @returns {Thread}
     */
    static insert(state, data) {
        if (data.id in state.threads) {
            return state.threads[data.id];
        }
        const thread = new Thread(data);
        thread.composer = Composer.insert(state, { threadId: thread.id });
        if (thread.type === "channel") {
            state.discuss.channels.threads.push(thread.id);
        }
        if (thread.type === "chat") {
            thread.is_pinned = data.serverData.is_pinned;
            state.discuss.chats.threads.push(thread.id);
            if (data.serverData) {
                for (const elem of data.serverData.channel.channelMembers[0][1]) {
                    Partner.insert(state, {
                        id: elem.persona.partner.id,
                        name: elem.persona.partner.name,
                    });
                    if (
                        elem.persona.partner.id !== state.user.partnerId ||
                        (data.serverData.channel.channelMembers[0][1].length === 1 &&
                            elem.persona.partner.id === state.user.partnerId)
                    ) {
                        thread.chatPartnerId = elem.persona.partner.id;
                        thread.name = state.partners[elem.persona.partner.id].name;
                    }
                }
            }
        }

        state.threads[thread.id] = thread;
        // return reactive version
        return state.threads[thread.id];
    }

    constructor(data) {
        const { id, name, type } = data;
        Object.assign(this, {
            hasWriteAccess: data.serverData && data.serverData.hasWriteAccess,
            id,
            name,
            type,
            counter: 0,
            isUnread: false,
            icon: false,
            loadMore: false,
            description: false,
            status: "new", // 'new', 'loading', 'ready'
            messages: [], // list of ids
            chatPartnerId: false,
            isAdmin: false,
            canLeave: data.canLeave || false,
            composer: null,
            serverLastSeenMsgByCurrentUser: data.serverData
                ? data.serverData.seen_message_id
                : null,
        });
        for (const key in data) {
            this[key] = data[key];
        }
    }

    get imgUrl() {
        const avatarCacheKey = this.serverData.channel.avatarCacheKey;
        if (this.type === "channel") {
            return `/web/image/mail.channel/${this.id}/avatar_128?unique=${avatarCacheKey}`;
        }
        if (this.type === "chat") {
            return `/web/image/res.partner/${this.chatPartnerId}/avatar_128?unique=${avatarCacheKey}`;
        }
        return false;
    }

    get isDescriptionChangeable() {
        return ["channel", "group"].includes(this.type);
    }

    get isRenameable() {
        return ["chat", "channel", "group"].includes(this.type);
    }

    get mostRecentMsgId() {
        if (this.messages.length === 0) {
            return undefined;
        }
        return Math.max(...this.messages);
    }

    get isEmpty() {
        return this.messages.length === 0;
    }

    get oldestMsgId() {
        if (this.messages.length === 0) {
            return undefined;
        }
        return Math.min(...this.messages);
    }
}
