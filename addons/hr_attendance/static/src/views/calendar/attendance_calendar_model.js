import { serializeDateTime } from "@web/core/l10n/dates";
import { CalendarModel } from "@web/views/calendar/calendar_model";
import { user } from "@web/core/user";

export class AttendanceCalendarModel extends CalendarModel {
    setup() {
        super.setup(...arguments);
        this.data.workingHours = [];
        this.employeeId = false;
    }

    get workingHours() {
        return this.data.workingHours;
    }

    async updateData(data) {
        await super.updateData(data);
        data.workingHours = await this.fetchWorkingHours(data);
    }

    async fetchWorkingHours(data) {
        if (!["day", "week"].includes(this.meta.scale)) {
            return [];
        }

        console.log("this.mneta.context", this.meta);

        const employeeId =
            this.meta.context.employee_id ||
            (
                this.meta.context.active_model === "hr.employee" &&
                this.meta.context.active_id
            ) ||
            this.employeeId ||
            (
                await this.orm.searchRead(
                    "hr.employee",
                    [["user_id", "=", user.userId]],
                    ["id"],
                    { limit: 1 },
                )
            )[0]?.id;

        if (!employeeId) {
            return [];
        }

        this.employeeId = employeeId;

        let { start, end } = data.range;

        if (this.meta.scale === "day") {
            const { date, firstDayOfWeek } = this.meta;
            const offset = (date.weekday - firstDayOfWeek + 7) % 7;
            start = date.minus({ days: offset }).startOf("day");
            end = start.plus({ days: 6 }).endOf("day");
        }

        return this.orm.call(
            "hr.attendance",
            "get_working_hours_for_calendar",
            [[employeeId], serializeDateTime(start), serializeDateTime(end)],
        );
    }
}
