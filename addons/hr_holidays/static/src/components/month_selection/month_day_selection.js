import { t, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import {
    SelectionField,
    selectionField,
    selectionFieldProps,
} from "@web/views/fields/selection/selection_field";

export class MonthDaySelectionField extends SelectionField {
    props = useProps({
        ...selectionFieldProps,
        month_field: t.string().optional(),
    });

    get #top() {
        const monthValue = this.props.record.data[this.props.month_field]
        // 2024 is a leap year
        return new Date(2024, parseInt(monthValue ?? 0), 0).getDate();
    }

    /**
     * @override
     */
    get options() {
        const options = super.options;
        const top = this.#top;

        return options.filter(option => Number(option[1]) <= top);
    }
}

export const monthDaySelectionField = {
    ...selectionField,
    component: MonthDaySelectionField,
    supportedOptions: [
        {
            label: "Month",
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

registry.category("fields").add("month_day_selection", monthDaySelectionField);
