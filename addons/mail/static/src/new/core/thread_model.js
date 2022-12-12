/* @odoo-module */

import { Composer } from "./composer_model";
import { Partner } from "./partner_model";
import { _t } from "@web/core/l10n/translation";
import { sprintf } from "@web/core/utils/strings";
import { removeFromArray } from "../utils/arrays";
import { cleanTerm } from "@mail/new/utils/format";

export class Thread {
    /** @type {string|number} */
    id;
    canLeave = false;
    /** @type {import("@mail/new/core/channel_member_model").channelMember[]} */
    channelMembers = [];
    /** @type {integer} */
    chatPartnerId;
    /** @type {Composer} */
    composer;
    counter = 0;
    /** @type {string} */
    customName;
    /** @type {string} */
    description;
    /** @type {import("@mail/new/core/follower_model").Follower[]} */
    followers = [];
    /** @type {string} */
    icon;
    isAdmin = false;
    isUnread = false;
    loadMore = false;
    memberCount = 0;
    message_needaction_counter = 0;
    /** @type {import("@mail/new/core/message_model").Message[]} */
    messages = [];
    /** @type {integer} */
    serverLastSeenMsgByCurrentUser;
    status = "new";
    /** @type {import("@mail/new/core/messaging").Messaging['state']} */
    _state;

    /**
     * @param {Object} param0
     * @param {string} param0.model
     * @param {number} param0.id
     */
    static createLocalId({ model, id }) {
        return `${model},${id}`;
    }

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {Object} data
     * @returns {Thread}
     */
    static insert(state, data) {
        if (data.id in state.threads) {
            const thread = state.threads[data.id];
            thread.update(data);
            return thread;
        }
        const thread = new Thread(state, data);
        // return reactive version
        return state.threads[thread.id];
    }

    constructor(state, data) {
        Object.assign(this, {
            id: data.id,
            type: data.type,
            _state: state,
        });
        if (this.type === "channel") {
            this._state.discuss.channels.threads.push(this.id);
        } else if (this.type === "chat") {
            this._state.discuss.chats.threads.push(this.id);
        }
        this.update(data);
        state.threads[this.id] = this;
    }

    update(data) {
        for (const key in data) {
            this[key] = data[key];
        }
        if (data.serverData) {
            const { serverData } = data;
            if ("authorizedGroupFullName" in serverData) {
                this.authorizedGroupFullName = serverData.authorizedGroupFullName;
            }
            if ("hasWriteAccess" in serverData) {
                this.hasWriteAccess = serverData.hasWriteAccess;
            }
            if ("is_pinned" in serverData) {
                this.is_pinned = serverData.is_pinned;
            }
            if ("message_needaction_counter" in serverData) {
                this.message_needaction_counter = serverData.message_needaction_counter;
            }
            if ("seen_message_id" in serverData) {
                this.serverLastSeenMsgByCurrentUser = serverData.seen_message_id;
            }
            if (this.type === "chat") {
                for (const elem of serverData.channel.channelMembers[0][1]) {
                    Partner.insert(this._state, elem.persona.partner);
                    if (
                        elem.persona.partner.id !== this._state.user.partnerId ||
                        (serverData.channel.channelMembers[0][1].length === 1 &&
                            elem.persona.partner.id === this._state.user.partnerId)
                    ) {
                        this.chatPartnerId = elem.persona.partner.id;
                        this.name = this._state.partners[elem.persona.partner.id].name;
                    }
                }
                this.customName = serverData.channel.custom_channel_name;
            }
        }
        Composer.insert(this._state, { thread: this });
    }

    /**
     * Remove a thread form the state
     */
    remove() {
        removeFromArray(this._state.discuss.chats.threads, this.id);
        removeFromArray(this._state.discuss.channels.threads, this.id);
        delete this._state.threads[this.id];
    }

    static searchSuggestions(state, cleanedSearchTerm, threadId, sort) {
        let threads;
        const thread = state.threads[threadId];
        if (
            thread &&
            (thread.type === "group" ||
                thread.type === "chat" ||
                (thread.type === "channel" && thread.authorizedGroupFullName))
        ) {
            // Only return the current channel when in the context of a
            // group restricted channel or group or chat. Indeed, the message with the mention
            // would appear in the target channel, so this prevents from
            // inadvertently leaking the private message into the mentioned
            // channel.
            threads = [thread];
        } else {
            threads = Object.values(state.threads);
        }
        const suggestionList = threads.filter(
            (thread) =>
                thread.type === "channel" &&
                thread.displayName &&
                cleanTerm(thread.displayName).includes(cleanedSearchTerm)
        );
        const sortFunc = (a, b) => {
            const isAPublicChannel = a.type === "channel" && !a.authorizedGroupFullName;
            const isBPublicChannel = b.type === "channel" && !b.authorizedGroupFullName;
            if (isAPublicChannel && !isBPublicChannel) {
                return -1;
            }
            if (!isAPublicChannel && isBPublicChannel) {
                return 1;
            }
            const isMemberOfA = a.isCurrentUserAsMember;
            const isMemberOfB = b.isCurrentUserAsMember;
            if (isMemberOfA && !isMemberOfB) {
                return -1;
            }
            if (!isMemberOfA && isMemberOfB) {
                return 1;
            }
            const cleanedADisplayName = cleanTerm(a.displayName || "");
            const cleanedBDisplayName = cleanTerm(b.displayName || "");
            if (
                cleanedADisplayName.startsWith(cleanedSearchTerm) &&
                !cleanedBDisplayName.startsWith(cleanedSearchTerm)
            ) {
                return -1;
            }
            if (
                !cleanedADisplayName.startsWith(cleanedSearchTerm) &&
                cleanedBDisplayName.startsWith(cleanedSearchTerm)
            ) {
                return 1;
            }
            if (cleanedADisplayName < cleanedBDisplayName) {
                return -1;
            }
            if (cleanedADisplayName > cleanedBDisplayName) {
                return 1;
            }
            return a.id - b.id;
        };
        return [
            {
                type: "Thread",
                suggestions: sort ? suggestionList.sort(sortFunc) : suggestionList,
            },
        ];
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

    get mostRecentNonTransientMessage() {
        if (this.messages.length === 0) {
            return undefined;
        }
        const oldestNonTransientMessageId = [...this.messages]
            .reverse()
            .find((messageId) => Number.isInteger(messageId));
        return this._state.messages[oldestNonTransientMessageId];
    }

    get isEmpty() {
        return this.messages.length === 0;
    }

    get oldestNonTransientMessage() {
        if (this.messages.length === 0) {
            return undefined;
        }
        const oldestNonTransientMessageId = this.messages.find((messageId) =>
            Number.isInteger(messageId)
        );
        return this._state.messages[oldestNonTransientMessageId];
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

    get areAllMembersLoaded() {
        return this.memberCount === this.channelMembers.length;
    }

    get unknownMemberCount() {
        return this.memberCount - this.channelMembers.length;
    }

    get displayName() {
        if (this.type === "chat" && this.chatPartnerId) {
            return this.customName || this.name;
        }
        if (this.type === "group" && !this.name) {
            return this.channelMembers.map((channelMember) => channelMember.name).join(_t(", "));
        }
        return this.name;
    }

    get invitationLink() {
        return `${window.location.origin}/chat/${this.id}/${this.uuid}`;
    }

    get accessRestrictedToGroupText() {
        if (!this.authorizedGroupFullName) {
            return false;
        }
        return sprintf(_t('Access restricted to group "%(groupFullName)s"'), {
            groupFullName: this.authorizedGroupFullName,
        });
    }

    get isCurrentUserAsMember() {
        return this.channelMembers.some((channelMember) => channelMember.isCurrentUser);
    }
}
