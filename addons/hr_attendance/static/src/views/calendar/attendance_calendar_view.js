import { registry } from "@web/core/registry";
import { calendarView } from "@web/views/calendar/calendar_view";
import { AttendanceCalendarController } from "./attendance_calendar_controller";
import { AttendanceCalendarModel } from "./attendance_calendar_model";
import { AttendanceCalendarRenderer } from "./attendance_calendar_renderer";

const AttendanceCalendarView = {
    ...calendarView,
    Controller: AttendanceCalendarController,
    Model: AttendanceCalendarModel,
    Renderer: AttendanceCalendarRenderer,
};

registry.category("views").add("attendance_calendar_view", AttendanceCalendarView);
