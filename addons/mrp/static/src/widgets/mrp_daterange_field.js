import { Component, useProps, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import {
    DateTimeField,
    dateRangeField,
    dateTimeFieldProps,
} from "@web/views/fields/datetime/datetime_field";

/**
 * Date range of a manufacturing order (scheduled date -> scheduled end).
 *
 * The dates are computed unless the user sets them: when a date is changed through this
 * widget, the record is flagged with `date_start_manual` / `date_finished_manual` so that the
 * server keeps the user's value instead of recomputing it. Computed dates are displayed muted.
 */
export class MrpDateRangeField extends Component {
    static template = xml`
        <div t-att-class="{
            o_mrp_date_start_computed: !this.props.record.data.date_start_manual,
            o_mrp_date_finished_computed: !this.props.record.data.date_finished_manual,
        }">
            <DateTimeField t-props="this.dateTimeFieldProps"/>
        </div>`;
    static components = { DateTimeField };
    props = useProps(dateTimeFieldProps);

    get dateTimeFieldProps() {
        return { ...this.props, record: this.getRecordProxy(this.props.record) };
    }

    getRecordProxy(record) {
        if (this._proxiedRecord !== record) {
            const manualFlags = {
                [this.props.name]: "date_start_manual",
                [this.props.endDateField]: "date_finished_manual",
            };
            this._proxiedRecord = record;
            this._recordProxy = new Proxy(record, {
                get(target, key) {
                    if (key === "update") {
                        return (changes, ...args) => {
                            const flags = {};
                            for (const [fieldName, flagName] of Object.entries(manualFlags)) {
                                const value = changes[fieldName];
                                // only flag the dates really changed by the user (typing in one
                                // input of the range re-parses both)
                                if (fieldName in changes && +value !== +target.data[fieldName]) {
                                    flags[flagName] = true;
                                }
                            }
                            return target.update({ ...changes, ...flags }, ...args);
                        };
                    }
                    const value = Reflect.get(target, key);
                    return typeof value === "function" ? value.bind(target) : value;
                },
            });
        }
        return this._recordProxy;
    }
}

export const mrpDateRangeField = {
    ...dateRangeField,
    component: MrpDateRangeField,
    fieldDependencies: (fieldInfo) => [
        ...dateRangeField.fieldDependencies(fieldInfo),
        // writable, so that the flags set by this widget are saved
        { name: "date_start_manual", type: "boolean", readonly: false },
        { name: "date_finished_manual", type: "boolean", readonly: false },
    ],
};

registry.category("fields").add("mrp_daterange", mrpDateRangeField);
