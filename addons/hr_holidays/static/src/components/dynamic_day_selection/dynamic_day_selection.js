import { t, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { SelectionField, selectionField, selectionFieldProps } from "@web/views/fields/selection/selection_field";

export class DynamicDaySelectionField extends SelectionField {
    props = useProps({
        ...selectionFieldProps,
        monthFieldName: t.string(),
    });

    get options() {
        const allOptions = super.options;
        const monthFieldName = this.props.monthFieldName;
        const monthValue = this.props.record.data[monthFieldName];

        if (!monthValue) {
            return allOptions;
        }

        // Leap year so that February always gets 29 days.
        const maxDays = new Date(2004, monthValue, 0).getDate();

        const filteredOptions = allOptions.filter(option => {
            if (!option[0]) {
                return true;
            }
            return parseInt(option[0]) <= maxDays;
        });

        return filteredOptions;
    }
}

export const dynamicDaySelection = {
    ...selectionField,
    component: DynamicDaySelectionField,

    extractProps({ attrs }) {
        return {
            ...selectionField.extractProps(...arguments),
            monthFieldName: attrs.month_field,
        };
    },

    fieldDependencies: ({ attrs }) => {
        return [
            {
                name: attrs.month_field,
                type: "selection",
            },
        ];
    },
};

registry.category("fields").add("dynamic_day_selection", dynamicDaySelection);
