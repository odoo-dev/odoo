import { LivechatCommandDialog } from "@im_livechat/core/common/livechat_command_dialog";

import { registerThreadAction } from "@mail/core/common/thread_actions";
import "@mail/discuss/call/common/thread_actions";

import { _t } from "@web/core/l10n/translation";
import { usePopover } from "@web/core/popover/popover_hook";

registerThreadAction("create-lead", {
    actionPanelComponent: LivechatCommandDialog,
    actionPanelComponentProps: ({ action, thread }) => ({
        close: () => action.actionPanelClose(),
        commandName: "lead",
        placeholderText: _t("e.g. Product pricing"),
        title: _t("Create Lead"),
        thread,
        icon: "fa fa-handshake-o",
    }),
    actionPanelOuterClass: "bg-100",
    condition: false, // managed by ThreadAction patch
    icon: "fa fa-handshake-o",
    name: _t("Create Lead"),
    onSelected({ owner }) {
        this.popover?.open(
            owner.root.el.querySelector(`[name="${this.id}"]`),
            this.actionPanelComponentProps
        );
    },
    sequence: 10,
    sequenceGroup: 25,
    setup({ owner }) {
        if (!owner.env.inChatWindow) {
            this.popover = usePopover(LivechatCommandDialog, {
                popoverClass: this.actionPanelOuterClass,
            });
        }
    },
});
