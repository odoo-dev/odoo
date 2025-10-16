import { ACTION_TAGS } from "@mail/core/common/action";
import { registerThreadAction } from "@mail/core/common/thread_actions";
import { SubChannelList } from "@mail/discuss/core/public_web/sub_channel_list";
import { useChildSubEnv } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { usePopover } from "@web/core/popover/popover_hook";

registerThreadAction("show-threads", {
    actionPanelComponent: SubChannelList,
    actionPanelComponentProps: ({ action, thread }) => {
        const channel = thread?.parent_channel_id || thread;
        return {
            close: () => action.actionPanelClose(),
            thread: channel,
        };
    },
    actionPanelOuterClass: "bg-100 border border-secondary",
    condition: ({ owner, thread }) =>
        (thread?.hasSubChannelFeature || thread?.parent_channel_id?.hasSubChannelFeature) &&
        !owner.isDiscussSidebarChannelActions,
    icon: "fa fa-fw fa-comments-o",
    name: _t("Threads"),
    onSelected({ owner }) {
        this.popover?.open(
            owner.root.el.querySelector(`[name="${this.id}"]`),
            this.actionPanelComponentProps
        );
    },
    setup({ owner, store }) {
        if (owner.env.inDiscussApp && !store.env.isSmall) {
            this.popover = usePopover(SubChannelList, {
                fixedPosition: true,
                popoverClass: this.actionPanelOuterClass,
            });
        }
        useChildSubEnv({ subChannelMenu: { open: () => !this.isActive && this.onSelected() } });
    },
    sequence: ({ owner }) => (owner.props.chatWindow ? 40 : 5),
    sequenceGroup: 10,
});
registerThreadAction("leave", {
    condition: ({ owner, thread }) =>
        (thread?.canLeave || thread?.canUnpin) && !owner.isDiscussContent,
    icon: "fa fa-fw fa-sign-out",
    name: ({ thread }) => (thread.canLeave ? _t("Leave Channel") : _t("Unpin Conversation")),
    onSelected: ({ thread }) => (thread.canLeave ? thread.leaveChannel() : thread.unpin()),
    partition: ({ owner }) => owner.env.inChatWindow,
    sequence: 10,
    sequenceGroup: 40,
    tags: ACTION_TAGS.DANGER,
});
