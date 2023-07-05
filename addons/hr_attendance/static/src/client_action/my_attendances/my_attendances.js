/** @odoo-module **/

import { CardLayout } from "@hr_attendance/components/card_layout/card_layout";
import { CheckInOut } from "@hr_attendance/components/check_in_out/check_in_out";
import { BreakInOut } from "@hr_attendance/components/break_in_out/break_in_out";
import { Component, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class MyAttendances extends Component {
    setup() {
        this.orm = useService("orm");
        this.user = useService("user");

        this.nextAction = "hr_attendance.hr_attendance_action_my_attendances";
        this.employee = false;
        this.checkedIn = false;
        this.breakIn = false;

        onWillStart(this.onWillStart);
    }

    async onWillStart() {
        const result = await this.orm.searchRead(
            "hr.employee.public",
            [["user_id", "=", this.user.userId]],
            ["attendance_state", "name", "hours_today", "in_break", "break_today"]
        );
        this.employee = result[0];
        if (this.employee) {
            this.hoursToday = registry.category("formatters").get("float_time")(
                this.employee.hours_today
            );
            this.breakToday = registry.category("formatters").get("float_time")(
                this.employee.break_today
            );
            this.checkedIn = this.employee.attendance_state === "checked_in";
            this.breakIn = this.employee.in_break === true;

        }
    }
}

MyAttendances.template = "hr_attendance.MyAttendances";
MyAttendances.components = { CardLayout, CheckInOut, BreakInOut };

registry.category("actions").add("hr_attendance_my_attendances", MyAttendances);
