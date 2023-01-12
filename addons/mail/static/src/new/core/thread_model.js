/* @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { sprintf } from "@web/core/utils/strings";

import { ScrollPosition } from "@mail/new/core/scroll_position_model";
import { createLocalId } from "../utils/misc";

export class Thread {
    /** @type {number} */
    id;
    /** @type {string} */
    uuid;
    /** @type {string} */
    model;
    canLeave = false;
    /** @type {import("@mail/new/core/channel_member_model").ChannelMember[]} */
    channelMembers = [];
    /** @type {RtcSession{}} */
    rtcSessions = {};
    /** @type {import("@mail/new/core/persona_model").Persona[]} */
    invitedPartners = [];
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
    isAdmin = false;
    isUnread = false;
    loadMore = true;
    memberCount = 0;
    message_needaction_counter = 0;
    message_unread_counter = 0;
    /** @type {number[]} */
    messages = [];
    /** @type {number} */
    serverLastSeenMsgByCurrentUser;
    /** @type {'opened' | 'folded' | 'closed'} */
    state;
    status = "new";
    /** @type {ScrollPosition} */
    scrollPosition = new ScrollPosition();
    typingMemberIds = [];
    /** @type {import("@mail/new/core/store_service").Store} */
    _store;
    /** @type {string} */
    defaultDisplayMode;
    /**
     * @typedef SeenInfo
     * @property {{id: number|undefined}} lastFetchedMessage
     * @property {{id: number|undefined}} lastSeenMessage
     * @property {{id: number}} partner
     */
    /** @type {SeenInfo[]} */
    seenInfos = [];

    constructor(store, data) {
        Object.assign(this, {
            id: data.id,
            model: data.model,
            type: data.type,
            _store: store,
        });
        if (this.type === "channel") {
            this._store.discuss.channels.threads.push(this.localId);
        } else if (this.type === "chat" || this.type === "group") {
            this._store.discuss.chats.threads.push(this.localId);
        }
        store.threads[this.localId] = this;
    }

    get accessRestrictedToGroupText() {
        if (!this.authorizedGroupFullName) {
            return false;
        }
        return sprintf(_t('Access restricted to group "%(groupFullName)s"'), {
            groupFullName: this.authorizedGroupFullName,
        });
    }

    get areAllMembersLoaded() {
        return this.memberCount === this.channelMembers.length;
    }

    get displayName() {
        if (this.type === "chat" && this.chatPartnerId) {
            return (
                this.customName ||
                this._store.personas[createLocalId("partner", this.chatPartnerId)].name
            );
        }
        if (this.type === "group" && !this.name) {
            return this.channelMembers.map((channelMember) => channelMember.name).join(_t(", "));
        }
        return this.name;
    }

    /**
     * @returns {import("@mail/new/core/follower_model").Follower}
     */
    get followerOfCurrentUser() {
        return this.followers.find((f) => f.partner === this._store.self);
    }

    get imgUrl() {
        const avatarCacheKey = this.serverData?.channel?.avatarCacheKey;
        if (this.type === "channel" || this.type === "group") {
            return `/web/image/mail.channel/${this.id}/avatar_128?unique=${avatarCacheKey}`;
        }
        if (this.type === "chat") {
            return `/web/image/res.partner/${this.chatPartnerId}/avatar_128?unique=${avatarCacheKey}`;
        }
        return false;
    }

    get isDescriptionChangeable() {
        return !this._store.guest && ["channel", "group"].includes(this.type);
    }

    get isRenameable() {
        return !this._store.guest && ["chat", "channel", "group"].includes(this.type);
    }

    get isTransient() {
        return !this.id;
    }

    get lastEditableMessageOfCurrentUser() {
        const messages = this.messages.map((id) => this._store.messages[id]);
        const editableMessagesOfCurrentUser = messages.filter(
            (message) => message.isSelfAuthored && message.canBeEdited
        );
        if (editableMessagesOfCurrentUser.length > 0) {
            return editableMessagesOfCurrentUser.at(-1);
        }
        return null;
    }

    get localId() {
        return createLocalId(this.model, this.id);
    }

    /** @returns {import("@mail/new/core/message_model").Message | undefined} */
    get mostRecentMsg() {
        if (!this.mostRecentMsgId) {
            return undefined;
        }
        return this._store.messages[this.mostRecentMsgId];
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
        return this._store.messages[oldestNonTransientMessageId];
    }

    get hasSelfAsMember() {
        return this.channelMembers.some((channelMember) => channelMember.isSelf);
    }

    get invitationLink() {
        if (!this.uuid || this.type === "chat") {
            return undefined;
        }
        return `${window.location.origin}/chat/${this.id}/${this.uuid}`;
    }

    get isEmpty() {
        return this.messages.length === 0;
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

    get oldestNonTransientMessage() {
        if (this.messages.length === 0) {
            return undefined;
        }
        const oldestNonTransientMessageId = this.messages.find((messageId) =>
            Number.isInteger(messageId)
        );
        return this._store.messages[oldestNonTransientMessageId];
    }

    get nonTransientMessages() {
        const messages = this.messages.map((id) => this._store.messages[id]);
        return messages.filter((message) => !message.isTransient);
    }

    get lastSelfMessageSeenByEveryone() {
        const otherSeenInfos = [...this.seenInfos].filter(
            (seenInfo) => seenInfo.partner.id !== this._store.self.id
        );
        if (otherSeenInfos.length === 0) {
            return false;
        }
        const otherLastSeenMessageIds = otherSeenInfos
            .filter((seenInfo) => seenInfo.lastSeenMessage)
            .map((seenInfo) => seenInfo.lastSeenMessage.id);
        if (otherLastSeenMessageIds.length === 0) {
            return false;
        }
        const lastMessageSeenByAllId = Math.min(...otherLastSeenMessageIds);
        const orderedSelfSeenMessages = this.nonTransientMessages.filter((message) => {
            return message.author === this._store.self && message.id <= lastMessageSeenByAllId;
        });
        if (!orderedSelfSeenMessages || orderedSelfSeenMessages.length === 0) {
            return false;
        }
        return orderedSelfSeenMessages.slice().pop();
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

    get unknownMembersCount() {
        return this.memberCount - this.channelMembers.length;
    }

    get hasTypingMembers() {
        return this.typingMembers.length !== 0;
    }

    get typingMembers() {
        return this.typingMemberIds.map((memberId) => this._store.channelMembers[memberId]);
    }
}
