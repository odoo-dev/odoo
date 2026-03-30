import { registry } from "@web/core/registry";
import { Component } from "@odoo/owl";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { _t } from "@web/core/l10n/translation";

const { Duration } = luxon;
export class UptimeWidget extends Component {
    static template = "pos_self_device.UptimeWidget";
    static props = { ...standardFieldProps };

    get formattedUptime() {
        const millis = Math.floor(this.props.record.data[this.props.name] || 0);
        if (!millis) {
            return _t("Never");
        }

        const duration = Duration.fromMillis(millis).shiftTo("days", "hours", "minutes");
        const parts = [];
        if (duration.days) {
            parts.push(_t("%sd", Math.floor(duration.days)));
        }
        if (duration.hours) {
            parts.push(_t("%sh", Math.floor(duration.hours)));
        }
        if (duration.minutes || !parts.length) {
            parts.push(_t("%smin", Math.floor(duration.minutes)));
        }

        return parts.join(" ");
    }
}

export const uptimeWidget = {
    component: UptimeWidget,
    isEmpty: () => false,
};

registry.category("fields").add("pos_self_device_uptime", uptimeWidget);
