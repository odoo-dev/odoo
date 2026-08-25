import { expect, test } from "@odoo/hoot";
import { click } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { defineModels, mockService, mountWithCleanup, onRpc } from "@web/../tests/web_test_helpers";
import { hrModels } from "@hr/../tests/hr_test_helpers";
import { ActivityMenu } from "@hr_attendance/components/attendance_menu/attendance_menu";

defineModels(hrModels);

const ATTENDANCE_TOGGLE = "[aria-label='Attendance']";

function employeeData(extra = {}) {
    return {
        id: 1,
        name: "Mitchell Admin",
        hours_today: 0,
        hours_previously_today: 0,
        today_attendance_ids: [],
        last_attendance_worked_hours: 0,
        last_check_in: false,
        attendance_state: "checked_out",
        display_systray: true,
        device_tracking_enabled: false,
        ...extra,
    };
}

function mockInitialEmployee(employee) {
    mockService("lazy_session", {
        getValue(key, callback) {
            callback(employee);
        },
    });
}

test("attendance systray still opens when the employee is still linked to the user", async () => {
    mockInitialEmployee(employeeData());
    onRpc("/hr_attendance/attendance_user_data", () => {
        expect.step("attendance_user_data");
        return employeeData();
    });

    await mountWithCleanup(ActivityMenu);
    expect(ATTENDANCE_TOGGLE).toHaveCount(1);

    await click(ATTENDANCE_TOGGLE);
    await animationFrame();

    expect.verifySteps(["attendance_user_data"]);
    expect(ATTENDANCE_TOGGLE).toHaveCount(1);
    expect(".o_wrap_btn_sign_out button").toHaveCount(1);
});

test("attendance systray hides itself when the employee has no linked user anymore", async () => {
    mockInitialEmployee(employeeData());
    onRpc("/hr_attendance/attendance_user_data", () => {
        expect.step("attendance_user_data");
        return {};
    });

    await mountWithCleanup(ActivityMenu);
    expect(ATTENDANCE_TOGGLE).toHaveCount(1);

    await click(ATTENDANCE_TOGGLE);
    await animationFrame();

    expect.verifySteps(["attendance_user_data"]);
    expect(ATTENDANCE_TOGGLE).toHaveCount(0);
});
