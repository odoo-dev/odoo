import { registry } from "@web/core/registry";
import { FloatFactorField } from "@web/views/fields/float_factor/float_factor_field";
import { FloatToggleField } from "@web/views/fields/float_toggle/float_toggle_field";
import { FloatTimeField } from "@web/views/fields/float_time/float_time_field";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

import { Component, plugin, props } from "@odoo/owl";
import { TimesheetUOMPlugin } from "../../plugins/timesheetUOM_plugin";

export class TimesheetUOM extends Component {
    props = props({
        ...standardFieldProps,
    });

    static template = "hr_timesheet.TimesheetUOM";
    static components = { FloatFactorField, FloatToggleField, FloatTimeField };

    timesheetUOM = plugin(TimesheetUOMPlugin);

    get timesheetComponent() {
        return this.timesheetUOM.getTimesheetComponent();
    }

    get timesheetComponentProps() {
        return this.timesheetUOM.getTimesheetComponentProps(this.props);
    }
}

export const timesheetUOM = {
    component: TimesheetUOM,
};

registry.category("fields").add("timesheet_uom", timesheetUOM);
