import { t, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import {
    SelectionField,
    selectionField,
    selectionFieldProps,
} from "@web/views/fields/selection/selection_field";
import { _t } from "@web/core/l10n/translation";

/**
 * Maximum number of days per month, including leap years
 */
const DAYS_PER_MONTH = {
    1: 31,
    2: 29,
    3: 31,
    4: 30,
    5: 31,
    6: 30,
    7: 31,
    8: 31,
    9: 30,
    10: 31,
    11: 30,
    12: 31,
};

/**
 * Days selection based on a month field
 */
export class DaysOfMonthSelectionField extends SelectionField {
    props = useProps({
        ...selectionFieldProps,
        month_field: t.string().optional(),
    });

    /**
     * @override
     */
    get options() {
        const maxDays = DAYS_PER_MONTH[Number(this.props.record.data[this.props.month_field])];
        if (!maxDays) {
            return super.options;
        }
        return super.options.filter(([value]) => Number(value) <= maxDays);
    }
}

export const daysOfMonthSelectionField = {
    ...selectionField,
    component: DaysOfMonthSelectionField,
    // We are basically a SelectionField, so allow styling for SelectionField to affect DaysOfMonthSelectionField too
    additionalClasses: ["o_field_selection"],
    supportedOptions: [
        {
            label: _t("Month field name"),
            name: "month_field",
            type: "string",
        },
    ],
    extractProps({ options }) {
        const props = selectionField.extractProps(...arguments);
        props.month_field = options.month_field;
        return props;
    },
};

registry.category("fields").add("days_of_month_selection", daysOfMonthSelectionField);
