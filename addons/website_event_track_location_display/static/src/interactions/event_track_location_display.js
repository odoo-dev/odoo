import { Component, onMounted, onWillDestroy, status, useState } from "@odoo/owl";

import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";

const REFRESH_INTERVAL = 30_000;
const FAILED_REFRESH_THRESHOLD = 3;

export class EventTrackLocationDisplay extends Component {
    static template = "website_event_track_location_display.EventTrackLocationDisplay";
    static props = {
        data: Object,
        refreshUrl: String,
    };

    setup() {
        this.state = useState({
            ...this.props.data,
            isOffline: false,
            lastUpdatedLabel: "",
        });
        this.failedRefreshes = 0;
        this.lastUpdatedAt = new Date();

        onMounted(() => this.scheduleRefresh());
        onWillDestroy(() => clearTimeout(this.refreshTimeout));
    }

    scheduleRefresh() {
        this.refreshTimeout = setTimeout(async () => {
            await this.refreshContent();
            if (status(this) !== "destroyed") {
                this.scheduleRefresh();
            }
        }, REFRESH_INTERVAL);
    }

    async refreshContent() {
        try {
            const data = await rpc(this.props.refreshUrl, {}, { silent: true });
            if (status(this) === "destroyed") {
                return;
            }
            const wasOffline = this.failedRefreshes >= FAILED_REFRESH_THRESHOLD;
            Object.assign(this.state, data);
            this.failedRefreshes = 0;
            this.lastUpdatedAt = new Date();
            if (wasOffline) {
                this.state.isOffline = false;
            }
        } catch {
            if (status(this) === "destroyed") {
                return;
            }
            this.failedRefreshes++;
            if (this.failedRefreshes === FAILED_REFRESH_THRESHOLD) {
                this.state.isOffline = true;
                this.state.lastUpdatedLabel = this.lastUpdatedAt.toLocaleTimeString([], { timeStyle: "short" });
            }
        }
    }
}

registry.category("public_components").add(
    "website_event_track_location_display.EventTrackLocationDisplay",
    EventTrackLocationDisplay
);
