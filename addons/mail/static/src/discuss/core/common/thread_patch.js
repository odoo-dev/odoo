import { useLayoutEffect } from "@web/owl2/utils";
import { Thread } from "@mail/core/common/thread";

import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

/** @type {Thread} */
const threadPatch = {
    setup() {
        super.setup(...arguments);
        useLayoutEffect(
            (loadNewer, mountedAndLoaded) => {
                if (
                    loadNewer ||
                    !mountedAndLoaded ||
                    !this.channel?.self_member_id ||
                    !this.scrollableRef()
                ) {
                    return;
                }
                const el = this.scrollableRef();
                if (Math.abs(el.scrollTop + el.clientHeight - el.scrollHeight) <= 1) {
                    this.channel.self_member_id.hideUnreadBanner = true;
                }
            },
            () => [this.props.thread.loadNewer, this.state.mountedAndLoaded, this.state.scrollTop]
        );
    },
    /** @override */
    applyScrollContextually(thread) {
        if (thread.channel?.self_member_id && thread.scrollUnread) {
            if (thread.firstUnreadMessage) {
                const messageEl = this.messageRefs.get(thread.firstUnreadMessage.id)?.();
                if (!messageEl) {
                    return;
                }
                const messageCenter =
                    messageEl.offsetTop -
                    this.scrollableRef().offsetHeight / 2 +
                    messageEl.offsetHeight / 2;
                this.setScroll(messageCenter);
            } else {
                const scrollTop =
                    this.props.order === "asc"
                        ? this.scrollableRef().scrollHeight - this.scrollableRef().clientHeight
                        : 0;
                this.setScroll(scrollTop);
            }
            thread.scrollUnread = false;
            if (this.shouldMarkAsReadOnScroll(thread)) {
                thread.markAsRead();
            }
        } else {
            super.applyScrollContextually(...arguments);
        }
    },
    /** @override */
    fetchInitialMessages() {
        if (this.channel?.self_member_id && this.props.thread.scrollUnread) {
            this.props.thread.loadAround({
                messageId: this.channel.self_member_id.new_message_separator,
            });
        } else {
            super.fetchInitialMessages();
        }
    },
    get newMessageBannerText() {
        if (this.channel?.self_member_id?.message_unread_counter > 1) {
            return _t("%s new messages", this.channel.self_member_id.message_unread_counter);
        }
        return _t("1 new message");
    },
    async onClickUnreadMessagesBanner() {
        await this.props.thread.loadAround({
            messageId: this.channel.self_member_id.new_message_separator_ui,
        });
        this.messageHighlight?.highlightMessage(this.props.thread.firstUnreadMessage);
    },

    get showStartMessage() {
        return (
            this.state.mountedAndLoaded &&
            !this.props.thread.loadOlder &&
            ["channel", "group", "chat"].includes(this.channel?.channel_type)
        );
    },

    get startMessageTitle() {
        const channelName = this.channel?.displayName;
        if (this.channel?.parent_channel_id) {
            return channelName;
        }
        if (this.channel?.channel_type === "channel") {
            return _t("Welcome to #%(channelName)s!", { channelName });
        }
        return this.channel.displayName;
    },

    get startMessageSubtitle() {
        if (this.channel?.parent_channel_id) {
            const authorName = Object.values(this.store["res.partner"].records).find((partner) =>
                partner.main_user_id?.eq(this.props.thread.channel.create_uid)
            )?.name;
            if (authorName) {
                return _t("Started by %(authorName)s", { authorName });
            }
        }
        if (this.channel?.channel_type === "channel") {
            return _t("This is the start of the #%(channelName)s channel", {
                channelName: this.channel.name,
            });
        }
        if (this.channel?.channel_type === "group") {
            return _t("This is the start of %(conversationName)s group", {
                conversationName: this.channel.displayName,
            });
        }
        return _t("This is the start of your direct chat with %(userName)s", {
            userName: this.channel.displayName,
        });
    },
};
patch(Thread.prototype, threadPatch);
