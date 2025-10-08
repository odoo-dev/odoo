import { registerMessageAction } from "@mail/core/common/message_actions";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";

registerMessageAction("create-or-view-thread", {
    condition: ({ message, store, thread }) =>
        message.thread?.eq(thread) &&
        message.thread.hasSubChannelFeature &&
        store.self.main_user_id?.share === false,
    icon: "fa fa-comments-o",
    onSelected: ({ message }) => {
        if (message.linkedSubChannel) {
            message.linkedSubChannel.open({ focus: true });
        } else {
            message.thread.createSubChannel({ initialMessage: message });
        }
    },
    name: ({ message }) => (message.linkedSubChannel ? _t("View Thread") : _t("Create Thread")),
    sequence: 75,
});
registerMessageAction("end-poll", {
    condition: ({ message }) =>
        message.started_poll_ids?.[0] &&
        !message.started_poll_ids[0].end_message_id &&
        message.started_poll_ids[0].createdBySelf,
    icon: " oi oi-view-cohort",
    name: _t("End Poll"),
    onSelected: ({ message }) =>
        rpc("/discuss/poll/end", { poll_id: message.started_poll_ids[0].id }),
    sequence: 115,
});
