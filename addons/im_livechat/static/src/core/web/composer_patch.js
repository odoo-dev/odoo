import { Composer } from "@mail/core/common/composer";
import { _t } from "@web/core/l10n/translation";

import { patch } from "@web/core/utils/patch";

patch(Composer.prototype, {
    get navigableListProps() {
        const props = super.navigableListProps;
        if (!this.hasSuggestions) {
            return props;
        }
        switch (this.suggestion.state.items.type) {
            case "Chatbot":
                {
                    props.options = this.suggestion.state.items.suggestions.map((item) => {
                        return {
                            label: item.name,
                            bot_id: item.id,
                            classList: "o-mail-Composer-suggestion",
                        };
                    });
                    props.optionTemplate = "mail.Composer.suggestionChannelCommand";
                }
                break;
        }
        return props;
    },

    onKeydown(ev) {
        super.onKeydown(ev);
        if (
            ev.key === "Tab" &&
            this.thread?.channel_type === "livechat" &&
            !this.props.composer.text
        ) {
            const threadChanged = this.store.goToOldestUnreadLivechatThread();
            if (threadChanged) {
                // prevent chat window from switching to the next thread: as
                // we want to go to the oldest unread thread, not the next
                // one.
                ev.stopPropagation();
            }
        }
    },
    get placeholder() {
        if (
            this.displayNextLivechatHint() &&
            this.props.composer.isFocused &&
            this.env.inChatWindow
        ) {
            return _t("Tab to next livechat");
        }
        return super.placeholder;
    },
    displayNextLivechatHint() {
        return (
            this.thread?.channel_type === "livechat" &&
            this.store.discuss.livechats.some(
                (thread) => thread.notEq(this.thread) && thread.isUnread
            )
        );
    },
});
