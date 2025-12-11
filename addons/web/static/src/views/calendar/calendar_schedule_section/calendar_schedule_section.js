import { Component, useEffect, useRef, useState } from "@odoo/owl";
import { useBus } from "@web/core/utils/hooks";

export class CalendarScheduleSection extends Component {
    static template = "web.CalendarScheduleSection";
    static props = {
        model: Object,
        editRecord: Function,
    };
    setup() {
        this.rootRef = useRef("eventsToSchedule");
        this.state = useState({ isDragging: false });
        useBus(this.props.model.bus, "CALENDAR_EVENT_DRAG", ({ detail }) => {
            this.state.isDragging = detail.drag;
        });
        useEffect(
            (el) => {
                new FullCalendar.Interaction.Draggable(el, {
                    itemSelector: ".o_event_to_schedule_draggable",
                    eventData: function (el) {
                        return {
                            title: el.innerText,
                            id: el.dataset.resId,
                        };
                    },
                    appendTo: document.body,
                });
            },
            () => [this.rootRef.el]
        );
    }

    get displayLoadMoreButton() {
        const { eventsToSchedule } = this.props.model.data;
        return eventsToSchedule && eventsToSchedule.records.length < eventsToSchedule.length;
    }

    openRecord(event) {
        this.props.editRecord({ ...event, title: event.name });
    }
}
