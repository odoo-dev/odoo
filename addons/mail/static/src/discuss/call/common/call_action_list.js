import { onWillRender, useLayoutEffect, useRef } from "@web/owl2/utils";
import { Component, toRaw } from "@odoo/owl";

import { isMobileOS } from "@web/core/browser/feature_detection";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { useCallActions } from "@mail/discuss/call/common/call_actions";
import { usePopover } from "@web/core/popover/popover_hook";
import { Tooltip } from "@web/core/tooltip/tooltip";
import { ActionList } from "@mail/core/common/action_list";
import { ACTION_TAGS } from "@mail/core/common/action";
import {
    MUTE_SUGGESTION_CONFIG,
    MUTE_SUGGESTION_NOTIFICATION_ID,
    MUTE_SUGGESTION_NOTIFICATION_TEXT,
    MUTE_SUGGESTION_TEXT,
} from "@mail/discuss/call/common/call_mute_suggestion";
import { CallSuggestionTooltip } from "@mail/discuss/call/common/call_suggestion_tooltip";

export class CallActionList extends Component {
    static components = { ActionList };
    static props = ["channel", "className?", "compact?", "pipExtraActions?"];
    static template = "discuss.CallActionList";

    setup() {
        super.setup();
        this.store = useService("mail.store");
        this.rtc = useService("discuss.rtc");
        this.pipService = useService("discuss.pip_service");
        this.callActions = useCallActions({ channel: () => this.props.channel });
        this.more = useRef("more");
        this.root = useRef("root");
        this.popover = usePopover(Tooltip, {
            position: "top-middle",
        });
        this.muteSuggestionPopover = usePopover(CallSuggestionTooltip, {
            position: "top-middle",
        });
        useLayoutEffect(
            () => {
                const { isVisible, text } = this.rtc.muteSuggestion;
                const target = this.rtc.muteSuggestionTarget;
                if (isVisible && target && !this.rtc.isPipMode) {
                    this.rtc.removeCallNotification(MUTE_SUGGESTION_NOTIFICATION_ID);
                    this.muteSuggestionPopover.open(target, {
                        text: text || MUTE_SUGGESTION_TEXT,
                        onDismiss: () => this.rtc.dismissMuteSuggestion(),
                    });
                } else {
                    this.muteSuggestionPopover.close();
                    if (isVisible && (!target || this.rtc.isPipMode)) {
                        this.rtc.addCallNotification({
                            id: MUTE_SUGGESTION_NOTIFICATION_ID,
                            delay: MUTE_SUGGESTION_CONFIG.activeDuration,
                            text: MUTE_SUGGESTION_NOTIFICATION_TEXT,
                        });
                    } else {
                        this.rtc.removeCallNotification(MUTE_SUGGESTION_NOTIFICATION_ID);
                    }
                }
            },
            () => [
                this.rtc.muteSuggestion.isVisible,
                this.rtc.muteSuggestion.text,
                this.rtc.muteSuggestionTarget,
                this.rtc.isPipMode,
            ]
        );
        onWillRender(() => {
            const partition = toRaw(this.callActions).partition;
            const other = partition.other.filter((a) => !a.tags.includes(ACTION_TAGS.CALL_LAYOUT));
            const group2 = [];
            for (const groupActions of partition.group) {
                const filtered = groupActions.filter(
                    (a) => !a.tags.includes(ACTION_TAGS.CALL_LAYOUT)
                );
                const sequenceGroup = filtered[0].sequenceGroup;
                const hasPipActions = sequenceGroup === 200 && this.props.pipExtraActions;
                const pipActions = hasPipActions ? toRaw(this.props.pipExtraActions) : [];
                const maxQuickActions = pipActions.length > 0 ? 1 : 4;
                const quickActions = filtered.slice(0, maxQuickActions);
                const moreActions = [...pipActions, ...filtered.slice(maxQuickActions)];
                const newGroup = moreActions?.length
                    ? [
                          ...quickActions,
                          this.callActions.more(
                              {
                                  actions: moreActions,
                                  dropdownMenuClass: "m-0 mb-1 overflow-x-hidden",
                                  dropdownPosition: "top-end",
                                  name: this.MORE,
                              },
                              sequenceGroup
                          ),
                      ]
                    : quickActions;
                group2.push(newGroup);
            }
            this.actions = [...group2, other];
        });
    }

    onButtonRef(actionId, el) {
        if (actionId === "mute") {
            this.rtc.muteSuggestionTarget = el;
        }
    }

    get MORE() {
        return _t("More");
    }

    get isOfActiveCall() {
        return Boolean(this.props.channel.eq(this.rtc.channel));
    }

    get isSmall() {
        return Boolean(this.props.compact && this.rtc.isFullscreen);
    }

    get isMobileOS() {
        return isMobileOS();
    }
}
