import { ActivityCalendarCommonPopover } from "./activity_calendar_common_popover";
import { CalendarCommonRenderer } from "@web/views/calendar/calendar_common/calendar_common_renderer";

export class ActivityCalendarCommonRender extends CalendarCommonRenderer {
    static components = {
        ...CalendarCommonRenderer.components,
        Popover: ActivityCalendarCommonPopover,
    };
}
