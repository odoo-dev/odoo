/* @odoo-module */

import { useMessaging } from "../messaging_hook";
import { ThreadIcon } from "./thread_icon";
import { ChannelSelector } from "./channel_selector";
import { PartnerImStatus } from "./partner_im_status";
import { useService } from "@web/core/utils/hooks";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { onExternalClick } from "@mail/new/utils/hooks";
import { Component, useState } from "@odoo/owl";
import { markEventHandled } from "../utils/misc";
import { ChatWindowIcon } from "../chat/chat_window_icon";

/**
 * @typedef {Object} Props
 * @extends {Component<Props, Env>}
 */
export class Sidebar extends Component {
    static template = "mail.discuss_sidebar";
    static components = { ChannelSelector, ThreadIcon, PartnerImStatus, ChatWindowIcon };
    static props = [];

    setup() {
        this.messaging = useMessaging();
        this.actionService = useService("action");
        this.dialogService = useService("dialog");
        this.orm = useService("orm");
        this.state = useState({
            editing: false,
        });
        onExternalClick("selector", () => {
            this.state.editing = false;
        });
    }

    openThread(ev, id) {
        markEventHandled(ev, "sidebar.openThread");
        this.messaging.setDiscussThread(id);
    }

    toggleCategory(category) {
        category.isOpen = !category.isOpen;
    }

    openCategory(category) {
        if (category.id === "channels") {
            this.actionService.doAction({
                name: this.env._t("Public Channels"),
                type: "ir.actions.act_window",
                res_model: "mail.channel",
                views: [
                    [false, "kanban"],
                    [false, "form"],
                ],
                domain: [["channel_type", "=", "channel"]],
            });
        }
    }

    openSettings(thread) {
        if (thread.type === "channel") {
            this.actionService.doAction({
                type: "ir.actions.act_window",
                res_model: "mail.channel",
                res_id: thread.id,
                views: [[false, "form"]],
                target: "current",
            });
        }
    }

    addToCategory(category) {
        this.state.editing = category.id;
    }

    /**
     * @param {number} channelId
     */
    unpinChannel(channelId) {
        this.orm.silent.call("mail.channel", "channel_pin", [channelId], { pinned: false });
        this.messaging.state.threads[channelId].remove();
    }

    stopEditing() {
        this.state.editing = false;
    }

    async leaveChannel(thread) {
        if (thread.type !== "group" && thread.isAdmin) {
            await this.askConfirmation(
                this.env._t(
                    "You are the administrator of this channel. Are you sure you want to leave?"
                )
            );
        }
        if (thread.type === "group") {
            await this.askConfirmation(
                this.env._t(
                    "You are about to leave this group conversation and will no longer have access to it unless you are invited again. Are you sure you want to continue?"
                )
            );
        }
        this.messaging.leaveChannel(thread.id);
    }

    askConfirmation(body) {
        return new Promise((resolve) => {
            this.dialogService.add(ConfirmationDialog, {
                body: body,
                confirm: resolve,
                cancel: () => {},
            });
        });
    }
}
