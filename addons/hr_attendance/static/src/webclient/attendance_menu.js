import { ActivityMenu } from "@hr_attendance/components/attendance_menu/attendance_menu";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { status } from "@odoo/owl";

patch(ActivityMenu.prototype, {
    setup() {
        super.setup();
        this.lazySession = useService("lazy_session");
    },
    async searchReadEmployee() {
        if (status(this) !== "new") {
            return super.searchReadEmployee();
        }
        this.lazySession.getValue("attendance_user_data", (employee) => {
            if (employee) {
                this.employee = employee;
                this._searchReadEmployeeFill();
            }
        });
    }
});
