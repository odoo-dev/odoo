import { ProjectCalendarCommonRenderer } from "./common/project_common_calendar_renderer";
import { CalendarRenderer } from "@web/views/calendar/calendar_renderer";

export class ProjectCalendarRenderer extends CalendarRenderer {
    static components = {
        ...CalendarRenderer.components,
        day: ProjectCalendarCommonRenderer,
        week: ProjectCalendarCommonRenderer,
        month: ProjectCalendarCommonRenderer,
    };
}
