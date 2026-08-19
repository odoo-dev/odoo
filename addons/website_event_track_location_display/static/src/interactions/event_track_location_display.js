import { Component, onMounted, onWillDestroy, useRef, useState } from "@odoo/owl";

import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";

const REFRESH_INTERVAL = 30_000;
const FAILED_REFRESH_THRESHOLD = 3;
const BACKGROUND_CLASS = "o_wevent_location_display_has_background";
const BACKGROUND_PROPERTY = "--o-wevent-location-display-background-image";

export class EventTrackLocationDisplay extends Component {
    static template = "website_event_track_location_display.EventTrackLocationDisplay";
    static props = {
        data: Object,
        refreshUrl: String,
    };

    setup() {
        this.contentRef = useRef("content");
        this.state = useState({
            ...this.props.data,
            isOffline: false,
            lastUpdatedLabel: "",
        });
        this.failedRefreshes = 0;
        this.lastUpdatedAt = new Date();
        this.isDestroyed = false;

        onMounted(() => {
            this.updateDisplay(this.state);
            this.scheduleRefresh();
        });
        onWillDestroy(() => {
            this.isDestroyed = true;
            clearTimeout(this.refreshTimeout);
        });
    }

    scheduleRefresh() {
        this.refreshTimeout = setTimeout(async () => {
            await this.refreshContent();
            if (!this.isDestroyed) {
                this.scheduleRefresh();
            }
        }, REFRESH_INTERVAL);
    }

    async refreshContent() {
        try {
            const data = await rpc(this.props.refreshUrl, {}, { silent: true });
            if (this.isDestroyed) {
                return;
            }
            const wasOffline = this.failedRefreshes >= FAILED_REFRESH_THRESHOLD;
            Object.assign(this.state, data);
            this.updateDisplay(data);
            this.failedRefreshes = 0;
            this.lastUpdatedAt = new Date();
            if (wasOffline) {
                this.state.isOffline = false;
            }
        } catch {
            if (this.isDestroyed) {
                return;
            }
            this.failedRefreshes++;
            if (this.failedRefreshes === FAILED_REFRESH_THRESHOLD) {
                this.state.isOffline = true;
                this.state.lastUpdatedLabel = this.lastUpdatedAt.toLocaleTimeString([], { timeStyle: "short" });
            }
        }
    }

    updateDisplay(data) {
        const display = this.contentRef.el.closest(".o_wevent_location_display");
        display.classList.toggle(BACKGROUND_CLASS, Boolean(data.backgroundImageUrl));
        if (data.backgroundImageUrl) {
            display.style.setProperty(BACKGROUND_PROPERTY, `url(${data.backgroundImageUrl})`);
        } else {
            display.style.removeProperty(BACKGROUND_PROPERTY);
        }
    }
}

registry.category("public_components").add(
    "website_event_track_location_display.EventTrackLocationDisplay",
    EventTrackLocationDisplay
);
