/** @odoo-module **/

import { registry } from "@web/core/registry";
import { getDifferentParents, triggerPointerEvent } from "../../../../web_tour/static/src/tour_service/tour_utils";

registry.category("web_tour.tours").add("test_dblclick_event_from_calendar", {
    test: true,
    steps: () => [
        {
            content: "Enter event form",
            trigger: 'a[data-event-id="1"]',
            run: "dblclick",
        },
        {
            content: "Change the name of the form",
            trigger: "input#name_0",
            run: "text make your bed",
        },
        {
            content: "Return to calendar",
            trigger: ".o_back_button",
        },
        {
            content: "Next week",
            trigger: ".o_calendar_button_next"
        },
        {
            content: "Access recurrence",
            trigger: 'a[data-event-id="2"]',
            run: "dblclick",
        },
        {
            content: "Change equipment",
            trigger: "input#duration_0",
            run: "text 2:00"
        },
        {
            content: "Return to calendar",
            trigger: ".o_back_button",
        },
        {
            trigger: 'a[data-event-id="2"]',
            isCheck: true,
        }
    ],
});

function moveEventInCalendar(eventID, weekdayTag, hour) {
    const requestEvent = document.querySelector(`a[data-event-id="${eventID}"]`)
    const requestRectangle = requestEvent.getBoundingClientRect();
    const requestPosition = {
        clientX: requestRectangle.x + requestRectangle.width / 2,
        clientY: requestRectangle.y + requestRectangle.height / 2
    };

    const dayColumn = document.querySelector(`.fc-day-header.fc-${weekdayTag}`);
    const columnRectangle = dayColumn.getBoundingClientRect();
    const hourRow = document.querySelector(`tr[data-time="${hour}"] td.fc-widget-content:not(.fc-time)`);
    const rowRectangle = hourRow.getBoundingClientRect();
    const destinationPosition = {
        clientX: columnRectangle.x + columnRectangle.width / 2,
        clientY: rowRectangle.y + rowRectangle.height / 2
    };

    triggerPointerEvent(requestEvent, "pointerdown", true, requestPosition);
    triggerPointerEvent(requestEvent, "pointermove", true, destinationPosition);

    for (const parent of getDifferentParents(requestEvent, hourRow)) {
        triggerPointerEvent(parent, "pointerenter", true, destinationPosition);
    }

    triggerPointerEvent(requestEvent, "pointerup", true, destinationPosition);
}

registry.category("web_tour.tours").add("test_drag_and_drop_event_in_calendar", {
    test: true,
    steps: () => [
        {
            content: "Move event to Wednesday 1.15 PM",
            trigger: 'a[data-event-id="1"]',
            run: function() {
                moveEventInCalendar(1, "wed", "13:30:00");
            },
        },
        {
            content: "Move recurrence to Wednesday 2.45 PM (nothing should happen)",
            trigger: 'a[data-event-id="2"]',
            run: function() {
                moveEventInCalendar(2, "wed", "11:00:00");
            },
        },
    ],
});
