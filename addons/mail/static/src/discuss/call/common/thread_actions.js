import { threadActionsRegistry } from "@mail/core/common/thread_actions";
import { CallSettings } from "@mail/discuss/call/common/call_settings";

import { useComponent, useState } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";

threadActionsRegistry
    .add("call", {
        condition(component) {
            return (
                component.thread?.allowCalls && !component.thread?.eq(component.rtc.state.channel)
            );
        },
        icon: "fa fa-fw fa-phone",
        iconLarge: "fa fa-fw fa-lg fa-phone",
        name: _t("Start a Call"),
        open(component) {
            component.rtc.toggleCall(component.thread);
        },
        sequence: 10,
        setup() {
            const component = useComponent();
            component.rtc = useState(useService("discuss.rtc"));
        },
    })
    .add("settings", {
        component: CallSettings,
        componentProps(action) {
            return { isCompact: true };
        },
        condition(component) {
            return (
                component.thread?.allowCalls &&
                (component.props.chatWindow?.isOpen || component.store.inPublicPage)
            );
        },
        icon: "fa fa-fw fa-gear",
        iconLarge: "fa fa-fw fa-lg fa-gear",
        name: _t("Show Settings"),
        nameActive: _t("Hide Settings"),
        sequence(component) {
            return component.props.chatWindow && component.thread?.eq(component.rtc.state.channel)
                ? 6
                : 60;
        },
        setup() {
            const component = useComponent();
            component.rtc = useState(useService("discuss.rtc"));
            this.panelOuterClass = component.props.chatWindow ? "p-2" : "";
        },
        toggle: true,
    });
