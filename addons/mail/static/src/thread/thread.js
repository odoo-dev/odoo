/** @odoo-module */

import { Component, onWillStart, onWillUpdateProps } from "@odoo/owl";
import { useMessaging } from "../messaging_hook";
import { useAutoScroll } from "../utils";
import { Message } from "./message";

export class Thread extends Component {
    setup() {
        this.messaging = useMessaging();
        if (!this.env.inChatter) {
            useAutoScroll("messages");
        }
        onWillStart(() => this.requestMessages(this.props.id));
        onWillUpdateProps((nextProps) => this.requestMessages(nextProps.id));
    }

    requestMessages(threadId) {
        // does not return the promise, so the thread is immediately rendered
        // then updated whenever messages get here
        this.messaging.fetchThreadMessages(threadId);
    }

    isSquashed(msg, prevMsg) {
        if (
            !prevMsg ||
            prevMsg.type === "notification" ||
            this.messaging.isMessageEmpty(prevMsg) ||
            this.env.inChatter
        ) {
            return false;
        }

        if (msg.authorId !== prevMsg.authorId) {
            return false;
        }
        if (msg.resModel !== prevMsg.resModel || msg.resId !== prevMsg.resId) {
            return false;
        }
        return msg.dateTime.ts - prevMsg.dateTime.ts < 60 * 1000;
    }
}

Object.assign(Thread, {
    components: { Message },
    props: ["id"],
    template: "mail.thread",
});
