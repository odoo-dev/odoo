/* @odoo-module */

import { Component, onWillStart, useExternalListener, useState } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { useService } from "@web/core/utils/hooks";
import {
    CHAT_WINDOW_END_GAP_WIDTH,
    CHAT_WINDOW_INBETWEEN_WIDTH,
    CHAT_WINDOW_WIDTH,
} from "../chat/chat_window_service";
import { useMessaging, useStore } from "../core/messaging_hook";
import { ChatWindow } from "./chat_window";
import { ChatWindowHiddenMenu } from "./chat_window_hidden_menu";

export class ChatWindowContainer extends Component {
    static components = { ChatWindow, ChatWindowHiddenMenu };
    static props = [];
    static template = "mail.chat_window_container";

    get CHAT_WINDOW_END_GAP_WIDTH() {
        return CHAT_WINDOW_END_GAP_WIDTH;
    }

    get CHAT_WINDOW_INBETWEEN_WIDTH() {
        return CHAT_WINDOW_INBETWEEN_WIDTH;
    }

    get CHAT_WINDOW_WIDTH() {
        return CHAT_WINDOW_WIDTH;
    }

    setup() {
        this.messaging = useMessaging();
        this.store = useStore();
        this.chatWindowService = useState(useService("mail.chat_window"));
        onWillStart(() => this.messaging.isReady);

        this.onResize();
        useExternalListener(browser, "resize", this.onResize);
    }

    onResize() {
        while (this.chatWindowService.visible.length > this.chatWindowService.maxVisible) {
            this.chatWindowService.hide(
                this.chatWindowService.visible[this.chatWindowService.visible.length - 1]
            );
        }
        while (
            this.chatWindowService.visible.length < this.chatWindowService.maxVisible &&
            this.chatWindowService.hidden.length > 0
        ) {
            this.chatWindowService.show(this.chatWindowService.hidden[0]);
        }
    }
}
