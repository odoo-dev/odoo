import { Composer } from "@mail/core/common/composer";
import { Thread } from "@mail/core/common/thread";
import { Component, onMounted, onWillUnmount, useEffect, useState } from "@odoo/owl";
import { Transition } from "@web/core/transition";
import { useService } from "@web/core/utils/hooks";
import { Call } from "./call";

/**
 * @typedef {Object} Props
 * @extends {Component<Props, Env>}
 */
export class Meeting extends Component {
    static template = "mail.Meeting";
    static props = {};
    static components = { Call, Composer, Thread, Transition };

    setup() {
        this.store = useService("mail.store");
        this.state = useState({ chatAlreadyOpened: false, jumpPresent: 0 });
        useEffect(
            (chatOpened) => {
                if (!this.state.chatAlreadyOpened && chatOpened) {
                    this.state.chatAlreadyOpened = true;
                }
            },
            () => [this.store.rtc.meetingChatOpened]
        );
        onMounted(() => (this.store.rtc.inMeeting = true));
        onWillUnmount(() => (this.store.rtc.inMeeting = false));
    }

    get channel() {
        return this.store.rtc.channel;
    }

    onAnimationDone() {}
}
