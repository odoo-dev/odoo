import { Component, useProps } from "@odoo/owl";
import { deserializeDateTime, formatDateTime } from "@web/core/l10n/dates";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

const { DateTime } = luxon;

/**
 * Format a start date in a few characters: the time when it is today (e.g. "3pm30",
 * "9am"), the day otherwise (e.g. "May 4").
 *
 * @param {DateTime} value
 * @param {DateTime} [now]
 * @returns {string}
 */
export function formatShortDateTime(value, now = DateTime.local()) {
    if (value.hasSame(now, "day")) {
        const minutes = value.minute ? value.toFormat("mm") : "";
        return `${value.toFormat("h")}${value.toFormat("a").toLowerCase()}${minutes}`;
    }
    return value.toFormat("MMM d");
}

/**
 * The start of the work of a manufacturing order card: of its work orders at the
 * work center of the card's column, else of all its work orders (`wc_date_start`)
 * or of the manufacturing order.
 */
export class MrpShortDatetimeField extends Component {
    static template = "mrp.MrpShortDatetimeField";
    props = useProps(standardFieldProps);

    get value() {
        const { data, group } = this.props.record;
        if (group?.groupByField?.name === "workcenter_ids") {
            const start = data.workcenter_states?.[String(group.value || 0)]?.date_start;
            return start ? deserializeDateTime(start) : false;
        }
        return data[this.props.name] || data.date_start || false;
    }

    get formattedValue() {
        return this.value ? formatShortDateTime(this.value.setZone("default")) : "";
    }

    get title() {
        return this.value ? formatDateTime(this.value) : "";
    }
}

registry.category("fields").add("mrp_short_datetime", {
    component: MrpShortDatetimeField,
    supportedTypes: ["datetime"],
    fieldDependencies: [
        { name: "date_start", type: "datetime" },
        { name: "workcenter_states", type: "json" },
    ],
});
