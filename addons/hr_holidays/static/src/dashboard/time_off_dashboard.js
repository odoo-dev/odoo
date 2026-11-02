import { useNewAllocationRequest } from "@hr_holidays/views/hooks";
import { Component, onWillStart, proxy, t, usePlugin, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { ORM } from "@web/core/orm_plugin";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";
import { TimeOffPlugin } from "../views/time_off_plugin";
import { TimeOffCard } from "./time_off_card";

export class TimeOffDashboard extends Component {
    static components = { TimeOffCard };
    static template = "hr_holidays.TimeOffDashboard";

    props = useProps({
        employeeId: t.or([t.number(), t.literal(null)]),
    });

    setup() {
        this.orm = usePlugin(ORM);
        this.actionService = usePlugin(ActionPlugin);
        this.newAllocRequest = useNewAllocationRequest();
        this.date = luxon.DateTime.now();
        this.state = proxy({
            holidays: [],
            allocationsNumber: "",
        });

        usePlugin(TimeOffPlugin).onUpdateDashboard(() => this.loadDashboardData());

        onWillStart(async () => this.loadDashboardData());
    }

    getContext() {
        const context = { from_dashboard: true };
        if (this.props && this.props.employeeId !== null) {
            context["employee_id"] = this.props.employeeId;
        }
        return context;
    }

    async loadDashboardData(date = false) {
        const context = this.getContext();
        if (date) {
            this.date = date;
        }
        const dashboardData = await this.orm.call(
            "hr.employee",
            "get_time_off_dashboard_data",
            [this.date],
            { context }
        );
        this.state.holidays = dashboardData["allocation_data"];
        this.state.allocationsNumber = dashboardData["allocations_number"];
    }

    openNewAllocation() {
        this.newAllocRequest({
            employeeId: this.props.employeeId,
        });
    }

    openPendingAllocations() {
        const context = this.getContext();
        this.actionService.doAction({
            type: "ir.actions.act_window",
            name: _t("Pending Allocations"),
            res_model: "hr.leave.allocation",
            views: [
                [false, "list"],
                [false, "form"],
            ],
            domain: [["state", "in", ["confirm", "validate1"]]],
            context,
        });
    }
}
