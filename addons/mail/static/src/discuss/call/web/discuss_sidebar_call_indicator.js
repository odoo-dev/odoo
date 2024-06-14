import { Thread } from "@mail/core/common/thread_model";
import { discussSidebarChannelIndicatorsRegistry } from "@mail/discuss/core/public_web/discuss_sidebar_channel_indicators_registry";

import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

/**
 * @typedef {Object} Props
 * @property {import(models").Thread} thread
 * @extends {Component<Props, Env>}
 */
export class DiscussSidebarCallIndicator extends Component {
    static template = "mail.DiscussSidebarCallIndicator";
    static props = { thread: { type: Thread } };
    static components = {};

    setup() {
        super.setup();
        this.rtc = useState(useService("discuss.rtc"));
    }
}

discussSidebarChannelIndicatorsRegistry.add("call-indicator", DiscussSidebarCallIndicator);
