import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";


// Automatic fallback mapping if XML options are omitted
const DEFAULT_MONTH_MAPPING = {
    first_day: "first_month",
    first_month_day: "first_month",
    second_month_day: "second_month",
    yearly_day: "yearly_month",
    carryover_day: "carryover_month",
};

export class HrHolidaysDaySelectionWithMonthFilter extends SelectionField {
    static props = {
        ...SelectionField.props,
        monthField: { type: String, optional: true},
    };

    get options() {
        const { record, name } = this.props;
        const allOptions = super.options;

        const monthFieldName = this.props.monthField || DEFAULT_MONTH_MAPPING[name];
        const monthValue = monthFieldName ? record.data[monthFieldName]: null;

        if (!monthValue) {
            return allOptions;
        }
        const month = parseInt(monthValue, 10);

        // 2020 is a leap year, so luxon.DateTime.local(2020, 2) will return 29
        const maxDays = luxon.DateTime.local(2020, month).daysInMonth;
        return allOptions.filter(([value]) => parseInt(value, 10) <= maxDays);
    }
}

export const hrHolidaysDaySelectionWithMonthFilter = {
    ...selectionField,
    component: HrHolidaysDaySelectionWithMonthFilter,
    displayName: _t("Selection With Month Filter"),
    extractProps: (fieldInfo, dynamicInfo) => {
        const props = selectionField.extractProps(fieldInfo, dynamicInfo);
        props.monthField = fieldInfo.options.month_field;
        return props;
    }, 
};

registry
    .category("fields")
    .add("dynamic_selection_day_with_month_filter", hrHolidaysDaySelectionWithMonthFilter);
