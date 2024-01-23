/** @odoo-module **/

import { waitFor } from "@odoo/hoot-dom";
import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_service/tour_utils";

const todayDate = function () {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${month}/${day}/${year} 10:00:00`;
};

registry.category("web_tour.tours").add("calendar_appointments_hour_tour", {
    url: "/web",
    test: true,
    steps: () => [
        stepUtils.showAppsMenuItem(),
        {
            trigger: '.o_app[data-menu-xmlid="calendar.mail_menu_calendar"]',
            content: "Open Calendar",
            run: "click",
        },
        {
            trigger: ".o-calendar-button-new",
            content: "Create a new event",
            run: "click",
        },
        {
            trigger: "#name_0",
            content: "Give a name to the new event",
            run: "text TEST EVENT",
        },
        {
            trigger: "#start_0",
            content: "Give a date to the new event",
            run: `text ${todayDate()}`,
        },
        {
            trigger: ".fa-cloud-upload",
            content: "Save the new event",
            run: "click",
        },
        {
            trigger: ".o_back_button",
            content: "Go back to Calendar view",
            run: "click",
        },
        {
            trigger: '.dropdown-toggle:contains("Week")',
            content: "Click to change calendar view",
            run: "click",
        },
        {
            trigger: '.dropdown-item:contains("Month")',
            content: "Change the calendar view to Month",
            run: "click",
        },
        {
            trigger: '.fc-day-header:contains("Mon")',
            content: "Check the day is properly displayed",
        },
        {
            trigger: '.fc-time:contains("10:00")',
            content: "Check the time is properly displayed",
        },
        {
            trigger: '.o_event_title:contains("TEST EVENT")',
            content: "Check the event title",
            isCheck: true,
        },
    ],
});

const clickOnTheEvent = {
    content: "Click on the event (focus + waiting)",
    trigger: 'a .fc-content:contains("Test Event")',
    run: async (helpers) => {
        helpers.anchor.click();
        await new Promise((r) => setTimeout(r, 1000));
        document.querySelector(".o_cw_custom_highlight").click();
        await waitFor(".o_cw_popover", { timeout: 8000 });
    },
};

registry.category("web_tour.tours").add("test_calendar_delete_tour", {
    test: true,
    steps: () => [
        {
            content: "Select filter (everybody)",
            trigger: 'div[data-value="all"] input',
        },
        clickOnTheEvent,
        {
            content: "Delete the event",
            trigger: ".o_cw_popover_delete",
        },
        {
            content: "Validate the deletion",
            trigger: 'button:contains("Delete")',
            run: async (helpers) => {
                helpers.anchor.click();
                await new Promise((r) => setTimeout(r, 1000));
            },
        },
    ],
});

registry.category("web_tour.tours").add("test_calendar_decline_tour", {
    test: true,
    steps: () => [
        clickOnTheEvent,
        {
            content: "Delete the event",
            trigger: ".o_cw_popover_delete",
        },
        {
            content: "Wait declined status",
            trigger: ".o_attendee_status_declined",
            isCheck: true,
        },
    ],
});

registry.category("web_tour.tours").add("test_calendar_decline_with_everybody_filter_tour", {
    test: true,
    steps: () => [
        {
            content: "Select filter (everybody)",
            trigger: 'div[data-value="all"] input',
        },
        clickOnTheEvent,
        {
            content: "Delete the event",
            trigger: ".o_cw_popover_delete",
        },
        {
            content: "Select filter (everybody)",
            trigger: 'div[data-value="all"] input',
        },
        {
            content: "Wait declined status",
            trigger: ".o_attendee_status_declined",
            isCheck: true,
        },
    ],
});
