/* @odoo-module */

import { Composer } from "./composer_model";
import { Partner } from "./partner_model";

export class Thread {
    /** @type {import("@mail/new/core/follower_model").Follower[]} */
    followers = [];
    /** @type {import("@mail/new/core/messaging").Messaging['state']} */
    _state;

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {Object} data
     * @returns {Thread}
     */
    static insert(state, data) {
        let thread;
        if (data.id in state.threads) {
            thread = state.threads[data.id];
        } else {
            thread = new Thread();
            thread._state = state;
        }
        thread.update(data);
        state.threads[thread.id] = thread;
        // return reactive version
        return state.threads[thread.id];
    }

    update(data) {
        const { canLeave, id, name, serverData, type } = data;
        Object.assign(this, {
            hasWriteAccess: serverData && serverData.hasWriteAccess,
            id,
            name,
            type,
            counter: 0,
            isUnread: false,
            is_pinned: serverData && serverData.is_pinned,
            icon: false,
            loadMore: false,
            description: false,
            status: "new", // 'new', 'loading', 'ready'
            messages: [], // list of ids
            chatPartnerId: false,
            isAdmin: false,
            canLeave: canLeave || false,
            composer: null,
            serverLastSeenMsgByCurrentUser: serverData ? serverData.seen_message_id : null,
            channelMembers: [],
        });
        for (const key in data) {
            this[key] = data[key];
        }
        if (!this.composer) {
            this.composer = Composer.insert(this._state, { threadId: this.id });
        }
        if (this.type === "channel") {
            this._state.discuss.channels.threads.push(this.id);
        }
        if (this.type === "chat") {
            this._state.discuss.chats.threads.push(this.id);
            if (serverData) {
                for (const elem of serverData.channel.channelMembers[0][1]) {
                    Partner.insert(this._state, {
                        id: elem.persona.partner.id,
                        name: elem.persona.partner.name,
                    });
                    if (
                        elem.persona.partner.id !== this._state.user.partnerId ||
                        (serverData.channel.channelMembers[0][1].length === 1 &&
                            elem.persona.partner.id === this._state.user.partnerId)
                    ) {
                        this.chatPartnerId = elem.persona.partner.id;
                        this.name = this._state.partners[elem.persona.partner.id].name;
                    }
                }
            }
        }
    }

    /**
     * @returns {import("@mail/new/core/follower_model").Follower}
     */
    get followerOfCurrentUser() {
        return this.followers.find((f) => f.partner.id === this._state.user.partnerId);
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

    /** @returns {import("@mail/new/core/message_model").Message | undefined} */
    get mostRecentMsg() {
        if (!this.mostRecentMsgId) {
            return undefined;
        }
        return this._state.messages[this.mostRecentMsgId];
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

    sortMessages() {
        this.messages.sort((msgId1, msgId2) => msgId1 - msgId2);
    }

    get onlineMembers() {
        const orderedOnlineMembers = [];
        for (const member of this.channelMembers) {
            if (member.im_status === "online") {
                orderedOnlineMembers.push(member);
            }
        }
        return orderedOnlineMembers.sort((p1, p2) => (p1.name < p2.name ? -1 : 1));
    }

    get offlineMembers() {
        const orderedOnlineMembers = [];
        for (const member of this.channelMembers) {
            if (member.im_status !== "online") {
                orderedOnlineMembers.push(member);
            }
        }
        return orderedOnlineMembers.sort((p1, p2) => (p1.name < p2.name ? -1 : 1));
    }
}
