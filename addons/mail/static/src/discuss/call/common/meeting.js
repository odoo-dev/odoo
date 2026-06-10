import { useChildSubEnv, useExternalListener, useSubEnv } from "@web/owl2/utils";
import { Composer } from "@mail/core/common/composer";
import { Thread } from "@mail/core/common/thread";
import { Call } from "@mail/discuss/call/common/call";
import { CallActionList } from "@mail/discuss/call/common/call_action_list";
import {
    inDiscussCallViewProps,
    useInDiscussCallView,
    useMessageScrolling,
} from "@mail/utils/common/hooks";

import { Component, onMounted, onWillUnmount, proxy } from "@odoo/owl";

import { browser } from "@web/core/browser/browser";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { useService } from "@web/core/utils/hooks";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { MeetingSideActions } from "./meeting_side_actions";
import { useThreadActions } from "@mail/core/common/thread_actions";
import { useMessageSearch } from "@mail/core/common/message_search_hook";

const PIP_EXTRA_ACTION_IDS = ["copy-invite-link", "meeting-chat"];

/** @typedef {"chat"|"invite"} MeetingPanel */

/**
 * @typedef {Object} Props
 * @property {ThreadActionDefinition.id} [autoOpenAction]
 * @extends {Component<Props, Env>}
 */
export class Meeting extends Component {
    static template = "mail.Meeting";
    static props = ["autoOpenAction?", ...inDiscussCallViewProps];
    static components = {
        Call,
        CallActionList,
        Composer,
        Dropdown,
        MeetingSideActions,
        Thread,
    };

    setup() {
        this.store = useService("mail.store");
        this.ui = useService("ui");
        this.rtc = useService("discuss.rtc");
        this.reactions = proxy([]);
        this.reactionTimeouts = new Map();
        useExternalListener(this.env.bus, "RTC-SERVICE:REACTION", ({ detail: { reaction } }) => {
            this.addReaction(reaction);
        });
        onMounted(() => {
            if (this.props.autoOpenAction) {
                this.threadActions.actions
                    .find((a) => a.id === this.props.autoOpenAction)
                    ?.onSelected();
            }
        });
        useInDiscussCallView();
        useSubEnv({
            inMeetingView: {
                openChat: () =>
                    this.threadActions.actions
                        .find((action) => action.id === "meeting-chat")
                        ?.actionPanelOpen(),
            },
        });
        this.threadActions = useThreadActions({ thread: () => this.channel.thread });
        this.messageHighlight = useMessageScrolling({ thread: () => this.channel.thread });
        this.messageSearch = useMessageSearch(this.channel.thread);
        useChildSubEnv({
            hasPreviousActionPanel: () => this.threadActions.actionStack.length > 0,
            messageHighlight: this.messageHighlight,
            messageSearch: this.messageSearch,
        });
        onMounted(() => (this.store.meetingViewOpened = true));
        onWillUnmount(() => {
            this.store.meetingViewOpened = false;
            for (const timeout of this.reactionTimeouts.values()) {
                browser.clearTimeout(timeout);
            }
            this.reactionTimeouts.clear();
        });
        useHotkey("escape", () => this.onEscape());
    }

    get channel() {
        return this.store.rtc.channel;
    }

    get pipExtraActions() {
        if (!this.rtc.isPipMode) {
            return [];
        }
        return this.threadActions.actions.filter((a) => PIP_EXTRA_ACTION_IDS.includes(a.id));
    }

    onEscape() {
        if (this.threadActions.activeAction) {
            this.threadActions.activeAction.actionPanelClose();
            return true;
        }
        if (this.rtc.isFullscreen) {
            this.rtc.exitFullscreen();
            return true;
        }
        return false;
    }

    addReaction(reaction) {
        const animatedReaction = {
            ...reaction,
            x: 12 + Math.random() * 76,
            sway: -20 + Math.random() * 40,
        };
        this.reactions.push(animatedReaction);
        this.reactionTimeouts.set(
            animatedReaction.id,
            browser.setTimeout(() => {
                const index = this.reactions.findIndex(({ id }) => id === animatedReaction.id);
                if (index !== -1) {
                    this.reactions.splice(index, 1);
                }
                this.reactionTimeouts.delete(animatedReaction.id);
            }, 2500)
        );
    }
}
