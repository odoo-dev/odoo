import { calendarView } from "@web/views/calendar/calendar_view";

import { TimeOffCalendarController } from "./calendar_controller";
import { TimeOffCalendarModel } from "./calendar_model";
import { TimeOffCalendarRenderer, TimeOffDashboardCalendarRenderer } from "./calendar_renderer";

import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { onWillStart, usePlugin } from "@odoo/owl";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

class TimeOffCalendarControllerHrLeave extends TimeOffCalendarController {
    setup() {
        super.setup();
        this.actionService = usePlugin(ActionPlugin);
        onWillStart(async () => {
            this.canCreateGroupTimeOff = await user.hasGroup(
                "hr_holidays.group_hr_holidays_responsible"
            );
        });
    }

    async onNewGroupTimeOff() {
        await this.actionService.doAction("hr_holidays.action_hr_leave_generate_multi_wizard");
    }
}

export const timeOffCalendarHrLeaveView = {
    ...calendarView,
    Controller: TimeOffCalendarControllerHrLeave,
    Renderer: TimeOffCalendarRenderer,
    Model: TimeOffCalendarModel,
    buttonTemplate: "hr_holidays.CalendarController.Buttons",
};

registry.category("views").add("time_off_calendar_dashboard", {
    ...timeOffCalendarHrLeaveView,
    Renderer: TimeOffDashboardCalendarRenderer,
});

registry.category("views").add("time_off_management_calendar", {
    ...timeOffCalendarHrLeaveView,
    buttonTemplate: "hr_holidays.CalendarController.ManagementButtons",
});
