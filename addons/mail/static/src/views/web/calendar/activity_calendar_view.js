import { ActivityCalendarRender } from "./activity_calendar_renderer";
import { registry } from "@web/core/registry";
import { calendarView } from "@web/views/calendar/calendar_view";

const activityCalendarView = {
    ...calendarView,
    Renderer: ActivityCalendarRender,
};

registry.category("views").add("activity_calendar", activityCalendarView);
