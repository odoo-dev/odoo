import { plugin, Plugin } from "@odoo/owl";

import { session } from "@web/session";
import { registry } from "@web/core/registry";
import { formatFloatTime, formatFloatFactor } from "@web/views/fields/formatters";
import { formatFloat } from "@web/core/utils/numbers";
import { FloatFactorField } from "@web/views/fields/float_factor/float_factor_field";
import { user } from "@web/core/user";
import { services } from "@web/core/services";

export class TimesheetUOMPlugin extends Plugin {
    setup() {
        if (!registry.category("formatters").contains("timesheet_uom")) {
            registry.category("formatters").add("timesheet_uom", this.formatter);
        }
        if (!registry.category("formatters").contains("timesheet_uom_no_toggle")) {
            registry.category("formatters").add("timesheet_uom_no_toggle", this.formatter);
        }
    }

    get timesheetUOMId() {
        return user.activeCompany.timesheet_uom_id;
    }

    get timesheetWidget() {
        let timesheet_widget = "float_factor";
        if (session.uom_ids && this.timesheetUOMId in session.uom_ids) {
            timesheet_widget = session.uom_ids[this.timesheetUOMId].timesheet_widget;
        }
        return timesheet_widget;
    }

    getTimesheetComponent(widgetName = this.timesheetWidget) {
        return registry.category("fields").get(widgetName, { component: FloatFactorField })
            .component;
    }

    getTimesheetComponentProps(props) {
        const factorDependantComponents = ["float_toggle", "float_factor"];
        return factorDependantComponents.includes(this.timesheetWidget)
            ? this._getFactorCompanyDependentProps(props)
            : props;
    }

    _getFactorCompanyDependentProps(props) {
        const factor = user.activeCompany.timesheet_uom_factor || props.factor;
        const digits = [0, 2];
        const trailingZeros = false;
        return { ...props, factor, digits, trailingZeros };
    }

    get formatter() {
        if (this.timesheetWidget === "float_time") {
            return formatFloatTime;
        }
        const factor = user.activeCompany.timesheet_uom_factor || 1;
        if (this.timesheetWidget === "float_toggle") {
            return (value, options = {}) => formatFloat(value * factor, options);
        }
        return (value, options = {}) =>
            formatFloatFactor(value, Object.assign({ factor }, options));
    }
}

services.add(TimesheetUOMPlugin);

/**
 * -----------------------------------------------------------------------------
 * @todo owl3 migration
 * temporary - to remove when all use of the currency service are removed
 * -----------------------------------------------------------------------------
 */
registry.category("services").add("timesheet_uom", {
    start() {
        return plugin(TimesheetUOMPlugin);
    }
});
