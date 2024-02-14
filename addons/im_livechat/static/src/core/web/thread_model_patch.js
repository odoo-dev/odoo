/* @odoo-module */

import { Record } from "@mail/core/common/record";
import { Thread } from "@mail/core/common/thread_model";
import { _t } from "@web/core/l10n/translation";

import { patch } from "@web/core/utils/patch";
import { LivechatChannel } from "@im_livechat/core/web/livechat_channel_model";

patch(Thread.prototype, {
    setup() {
        super.setup(...arguments);
        this.livechatChannel = Record.one("LivechatChannel");
        this.discussAppAsLivechat = Record.one("DiscussApp", {
            compute() {
                if (this.channel_type === "livechat") {
                    return this._store.discuss;
                }
            },
        });
    },
    _computeDiscussAppCategory() {
        if (this.channel_type !== "livechat") {
            return super._computeDiscussAppCategory();
        }
        if (this.livechatChannel) {
            return {
                id: `${LivechatChannel.APP_CATEGORY_PREFIX}_${this.livechatChannel.id}`,
            };
        }
        return {
            id: `${LivechatChannel.APP_CATEGORY_PREFIX}_default`,
            name: _t("Livechat"),
            sequence: LivechatChannel.APP_CATEGORY_SEQUENCE,
            extraClass: "o-mail-DiscussSidebarCategory-livechat",
        };
    },
    get hasMemberList() {
        return this.channel_type === "livechat" || super.hasMemberList;
    },
    get canLeave() {
        return this.channel_type !== "livechat" && super.canLeave;
    },
    get canUnpin() {
        if (this.channel_type === "livechat") {
            return this.message_unread_counter === 0;
        }
        return super.canUnpin;
    },

    get correspondents() {
        return super.correspondents.filter((correspondent) => !correspondent.is_bot);
    },

    computeCorrespondent() {
        let correspondent = super.computeCorrespondent();
        if (this.channel_type === "livechat" && !correspondent) {
            // For livechat threads, the correspondent is the first
            // channel member that is not the operator.
            const orderedChannelMembers = [...this.channelMembers].sort((a, b) => a.id - b.id);
            const isFirstMemberOperator = orderedChannelMembers[0]?.persona.eq(this.operator);
            correspondent = isFirstMemberOperator
                ? orderedChannelMembers[1]?.persona
                : orderedChannelMembers[0]?.persona;
        }
        return correspondent;
    },

    get displayName() {
        if (this.channel_type !== "livechat" || !this.correspondent) {
            return super.displayName;
        }
        if (!this.correspondent.is_public && this.correspondent.country) {
            return `${this.getMemberName(this.correspondent)} (${this.correspondent.country.name})`;
        }
        if (this.anonymous_country) {
            return `${this.getMemberName(this.correspondent)} (${this.anonymous_country.name})`;
        }
        return this.getMemberName(this.correspondent);
    },

    get avatarUrl() {
        if (this.channel_type === "livechat" && this.correspondent) {
            return this.correspondent.avatarUrl;
        }
        return super.avatarUrl;
    },

    /**
     *
     * @param {import("models").Persona} persona
     */
    getMemberName(persona) {
        if (this.channel_type !== "livechat") {
            return super.getMemberName(persona);
        }
        if (persona.user_livechat_username) {
            return persona.user_livechat_username;
        }
        return super.getMemberName(persona);
    },
});
