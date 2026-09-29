import { UIPlugin } from "@web/core/ui/ui_plugin";
import { useSubEnv } from "@web/owl2/utils";
import { Composer } from "@mail/core/common/composer";
import { Thread } from "@mail/core/common/thread";
import { ActionPanel } from "@mail/discuss/core/common/action_panel";
import { Typing } from "@mail/discuss/typing/common/typing";

import { Component, proxy, signal, types, usePlugin, useProps } from "@odoo/owl";

import { isMobileOS } from "@web/core/browser/feature_detection";
import { useService } from "@web/core/utils/hooks";

export class MeetingChat extends Component {
    static template = "mail.MeetingChat";
    static components = {
        ActionPanel,
        Composer,
        Thread,
        Typing,
    };

    setup() {
        this.props = useProps({ close: types.function([types.instanceOf(MouseEvent)]) });
        this.store = useService("mail.store");
        this.ui = usePlugin(UIPlugin);
        this.rtc = useService("discuss.rtc");
        this.state = proxy({ jumpPresent: 0 });
        this.panelContentRef = signal.ref();
        this.isMobileOS = isMobileOS();
        useSubEnv({ inMeetingChat: true });
    }

    get channel() {
        return this.store.rtc.channel;
    }
}
