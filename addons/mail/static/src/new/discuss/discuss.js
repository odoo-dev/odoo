/** @odoo-module */

import { AutogrowInput } from "./autogrow_input";
import { Sidebar } from "./sidebar";
import { Thread } from "../thread/thread";
import { ThreadIcon } from "./thread_icon";
import { useMessaging } from "../messaging_hook";
import { Composer } from "../composer/composer";
import { CallUI } from "../rtc/call_ui";
import { Component, onWillStart, onMounted, onWillUnmount } from "@odoo/owl";

export class Discuss extends Component {
    setup() {
        this.messaging = useMessaging();
        onWillStart(() => this.messaging.isReady);
        onMounted(() => (this.messaging.discuss.isActive = true));
        onWillUnmount(() => (this.messaging.discuss.isActive = false));
    }

    currentThread() {
        return this.messaging.threads[this.messaging.discuss.threadId];
    }

    unstarAll() {
        this.messaging.unstarAll();
    }
    startCall() {
        this.messaging.startCall(this.messaging.discuss.threadId);
    }

    async renameThread({ value: name }) {
        const newName = name.trim();
        const thread = this.currentThread();
        if (
            newName !== thread.name &&
            ((newName && thread.type === "channel") ||
                thread.type === "chat" ||
                thread.type === "group")
        ) {
            await this.messaging.notifyThreadNameToServer(thread.id, newName);
        }
    }
}

Object.assign(Discuss, {
    components: { AutogrowInput, Sidebar, Thread, ThreadIcon, Composer, CallUI },
    props: ["*"],
    template: "mail.discuss",
});
