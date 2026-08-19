import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";

import { EventTrackLocationDisplay } from "@website_event_track_location_display/interactions/event_track_location_display";

const BACKGROUND_IMAGE =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC";

patch(EventTrackLocationDisplay.prototype, {
    scheduleRefresh() {
        const display = this.contentRef.el.closest(".o_wevent_location_display");
        display.refreshForTour = () => this.refreshContent();
        display.dataset.refreshReady = "";
    },
});

registry.category("web_tour.tours").add("website_event_track_location_display", {
    steps: () => [
        {
            content: "Check the initial location display",
            trigger: [
                ".o_wevent_location_display[data-refresh-ready]",
                ":not(.o_wevent_location_display_has_background)",
                ":has(.o_wevent_location_display_logo)",
                ":has(h1:contains('Main Stage'))",
                ":has(.o_wevent_location_display_live:contains('Live Now'))",
                ":has(.o_wevent_location_display_track:contains('Live'):contains('Test Speaker'))",
                ":has(.o_wevent_location_display_upcoming_list:contains('Next'))",
                ":has(.o_wevent_location_display_refresh_status.d-none)",
            ].join(""),
        },
        {
            content: "Refresh after adding a background",
            trigger: ".o_wevent_location_display",
            async run() {
                const display = document.querySelector(".o_wevent_location_display");
                const eventId = Number(window.location.pathname.split("/")[2]);
                await rpc("/web/dataset/call_kw/event.event/write", {
                    model: "event.event",
                    method: "write",
                    args: [[eventId], { location_display_background: BACKGROUND_IMAGE }],
                    kwargs: {},
                });
                await display.refreshForTour();
            },
        },
        {
            content: "Check the refreshed location display and background image",
            trigger: [
                ".o_wevent_location_display.o_wevent_location_display_has_background",
                "[style*='location_display_background']",
                ":has(.o_wevent_location_display_upcoming_list.bg-black-25.text-white)",
            ].join(""),
            async run() {
                const eventId = Number(window.location.pathname.split("/")[2]);
                const response = await fetch(
                    `/web/image/event.event/${eventId}/location_display_background`
                );
                if (!response.ok) {
                    throw new Error("The location display background image could not be loaded");
                }
            },
        },
    ],
});
