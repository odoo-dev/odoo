/** @odoo-module **/
import { registry } from "@web/core/registry";
import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";

export class DaysInMonthSelection extends SelectionField {

    static props = {
        ...SelectionField.props,
        monthField: { type: String, optional: true },
    };

    get options() {
        const monthFieldName = this.props.monthField;
        const monthValue = this.props.record.data[monthFieldName] ?? null;
        const maxDay = this.getDaysRange(monthValue);
        return [...Array(maxDay).keys()].map(i => [String(i + 1), String(i + 1)]);
    }

    getDaysRange(month) {
        if (!month) return 31;
        const luxonMonth = luxon.DateTime.fromObject({year: 2024, month: parseInt(month)}); //2024 is leap year - this will enforce 29 for February
        return luxonMonth.isValid ? luxonMonth.daysInMonth : 31;
    }

    onChange(value) {
        this.props.record.update({ [this.props.name]: value }, { save: this.props.autosave });
    }
}

export const daysInMonthSelection = {
    ...selectionField,
    component: DaysInMonthSelection,
    supportedTypes: ["selection", "integer"],
    extractProps({ options, viewType }, dynamicInfo) {
        const props = selectionField.extractProps(...arguments);
        props.monthField = options.month;
        return props;
    },
};

registry.category("fields").add("daysInMonthSelection", daysInMonthSelection);
