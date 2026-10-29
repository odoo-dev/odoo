import { BrowsingHistoryPlugin } from "@im_livechat/core/web/browsing_history_plugin";
import { StorePlugin } from "@mail/core/common/store_plugin";

import { Component, computed, t, useEffect, usePlugin, useProps } from "@odoo/owl";

export class LivechatBrowsingHistory extends Component {
    static template = "im_livechat.LivechatBrowsingHistory";

    setup() {
        super.setup();
        this.browsingHistoryPlugin = usePlugin(BrowsingHistoryPlugin);
        /** @type {import("models").Store} */
        this.store = usePlugin(StorePlugin);
        this.props = useProps({
            channel: t.instanceOf(this.store["discuss.channel"]),
        });
        this.pageViews = computed(() =>
            this.props.channel.browsingHistory.map((visit) => {
                const datetime = luxon.DateTime.fromISO(visit.visit_datetime);
                return {
                    url: visit.url,
                    title: visit.title,
                    visitTime: datetime.isValid
                        ? datetime.toLocaleString(luxon.DateTime.TIME_24_SIMPLE)
                        : "",
                };
            })
        );
        useEffect(() => {
            if (this.props.channel.browsingHistoryStatus === "idle") {
                this.requestBrowsingHistory();
            }
        });
    }

    requestBrowsingHistory() {
        if (this.props.channel.browsingHistoryStatus === "loading") {
            return;
        }
        this.browsingHistoryPlugin.request(this.props.channel);
    }
}
