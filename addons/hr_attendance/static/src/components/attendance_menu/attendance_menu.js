import { Component, onWillStart, useState } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { deserializeDateTime } from "@web/core/l10n/dates";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { isIosApp } from "@web/core/browser/feature_detection";

export class ActivityMenu extends Component {
    static components = { Dropdown, DropdownItem };
    static props = [];
    static template = "hr_attendance.attendance_menu";

    setup() {
        this.ui = useService("ui");
        this.lazySession = useService("lazy_session");

        this.state = useState({
            checkedIn: false,
            isDisplayed: false,
        });

        this.date_formatter = registry.category("formatters").get("float_time");
        this.dropdown = useDropdownState();

        onWillStart(() => {
            this.lazySession.getValue("attendance_user_data", (employee) => {
                if (employee) {
                    this.employee = employee;
                    this._searchReadEmployeeFill();
                }
            });
        });
    }

    async searchReadEmployee() {
        this.employee = await rpc("/hr_attendance/attendance_user_data");
        this._searchReadEmployeeFill();
    }

    _searchReadEmployeeFill() {
        if (!this.employee?.id) {
            this.state.isDisplayed = false;
            return;
        }

        this.employeeName = this.employee.name;
        this.state.isDisplayed = this.employee.display_systray;
        this.state.checkedIn = this.employee.attendance_state === "checked_in";

        this.hoursToday = this.date_formatter(this.employee.hours_today);

        this.attendancesToday = (this.employee.today_attendance_ids || []).map((att) => {
            const checkIn = deserializeDateTime(att.check_in).toLocaleString({
                hour: "2-digit",
                minute: "2-digit",
            });
            const checkOut = att.check_out
                ? deserializeDateTime(att.check_out).toLocaleString({
                      hour: "2-digit",
                      minute: "2-digit",
                  })
                : null;
            const duration = att.check_out
                ? att.worked_hours
                : this.employee.last_attendance_worked_hours;
            return {
                id: att.id,
                start: checkIn,
                end: checkOut,
                duration: this.date_formatter(duration),
            };
        });
        this.hasCheckedInToday = this.attendancesToday.length > 0;
    }

    splitTime(timeStr) {
        const [h, m] = timeStr.split(":");
        return { h, m };
    }

    async signInOut() {
        this.dropdown.close();
        const trackingEnabled = this.employee?.device_tracking_enabled;

        if (trackingEnabled && !isIosApp() && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async ({ coords }) => {
                    this.employee = await rpc("/hr_attendance/systray_check_in_out", coords);
                    this._searchReadEmployeeFill();
                },
                async () => {
                    this.employee = await rpc("/hr_attendance/systray_check_in_out");
                    this._searchReadEmployeeFill();
                },
                { enableHighAccuracy: true }
            );
        } else {
            this.employee = await rpc("/hr_attendance/systray_check_in_out");
            this._searchReadEmployeeFill();
        }
    }
}

export const systrayAttendance = {
    Component: ActivityMenu,
};

registry
    .category("systray")
    .add("hr_attendance.attendance_menu", systrayAttendance, { sequence: 101 });
