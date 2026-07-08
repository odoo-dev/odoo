import { registry } from "@web/core/registry";
import { selectionField, SelectionField } from "@web/views/fields/selection/selection_field";

const LEAP_YEAR = 2020;

function getLastDayOfMonth(month) {
    return month
        ? new Date(LEAP_YEAR, Number(month), 0).getDate()
        : 31;
}

export class DaySelectionByMonthField extends SelectionField {
    static props = {
        ...SelectionField.props,
        selectedMonth: { type: String, optional: true },
    };

    get options() {
        const selectedMonth = this.props.record.data[this.props.selectedMonth];
        const lastDay = getLastDayOfMonth(selectedMonth);

        return super.options.filter(([day]) => day <= lastDay);
    }
}

export const daySelectionByMonthField = {
    ...selectionField,
    component: DaySelectionByMonthField,
    extractProps: (fieldInfo, dynamicInfo) => {
        const props = selectionField.extractProps(fieldInfo, dynamicInfo);
        props.selectedMonth = fieldInfo.options.selected_month;
        return props;
    },
};

registry.category("fields").add("day_selection_by_month", daySelectionByMonthField);
