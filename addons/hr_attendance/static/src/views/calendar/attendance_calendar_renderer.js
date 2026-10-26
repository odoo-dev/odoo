import { CalendarRenderer } from "@web/views/calendar/calendar_renderer";
import { CalendarCommonRenderer } from "@web/views/calendar/calendar_common/calendar_common_renderer";

export class AttendanceCalendarRenderer extends CalendarRenderer {
    static components = {
        ...CalendarRenderer.components,
        day: CalendarCommonRenderer,
        week: CalendarCommonRenderer,
        month: CalendarCommonRenderer,
    };
}
