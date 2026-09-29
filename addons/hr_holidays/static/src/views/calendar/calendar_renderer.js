import { usePlugin } from "@odoo/owl";
import { UIPlugin } from "@web/core/ui/ui_plugin";
import { CalendarRenderer } from "@web/views/calendar/calendar_renderer";

import { TimeOffCalendarCommonRenderer } from "./common/calendar_common_renderer";
import { TimeOffCalendarYearRenderer } from "./year/calendar_year_renderer";

import { TimeOffDashboard } from "../../dashboard/time_off_dashboard";

export class TimeOffCalendarRenderer extends CalendarRenderer {
    static template = "hr_holidays.CalendarRenderer";
    static components = {
        ...TimeOffCalendarRenderer.components,
        day: TimeOffCalendarCommonRenderer,
        week: TimeOffCalendarCommonRenderer,
        month: TimeOffCalendarCommonRenderer,
        year: TimeOffCalendarYearRenderer,
        TimeOffDashboard,
    };
    get employeeId() {
        return this.props.model.employeeId;
    }

    get showDashboard() {
        return false;
    }
}

export class TimeOffDashboardCalendarRenderer extends TimeOffCalendarRenderer {
    setup() {
        super.setup();
        this.uiService = usePlugin(UIPlugin);
    }
    get showDashboard() {
        return !this.uiService.isSmall;
    }
}
