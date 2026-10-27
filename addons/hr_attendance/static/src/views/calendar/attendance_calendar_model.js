import { CalendarModel } from "@web/views/calendar/calendar_model";
import {
    filtersOnEmployee,
    HIDE_EMPLOYEE_CONTEXT_KEY,
} from "@hr_attendance/views/attendance_display_name";

export class AttendanceCalendarModel extends CalendarModel {
    /**
     * @override
     */
    async load(params = {}) {
        const domain = params.domain || this.meta.domain;
        const context = params.context || this.meta.context;
        params = {
            ...params,
            context: { ...context, [HIDE_EMPLOYEE_CONTEXT_KEY]: filtersOnEmployee(domain) },
        };
        return super.load(params);
    }
}
