import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { Component } from "@odoo/owl";
import { SelectionField } from "@web/views/fields/selection/selection_field";

function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}
export class DaySelector extends SelectionField {
    static template = "web.SelectionField";
    static props = { ...standardFieldProps, month: { type: String } };

    get options() {
        let all_days = [];
        let current_month = this.props.record.data[this.props.month];
        let leap_year_example = 2024
        let max_day = getDaysInMonth(leap_year_example, current_month);
        for (let i = 1; i <= max_day; i++) {
            all_days.push([i.toString(), i.toString()]);
        }
        return all_days;
    }

    async onDayChange(ev) {
        const newValue = ev.target.value;
        await this.props.update(newValue);
    }
}

export const daySelector = {
    ...SelectionField,
    component: DaySelector,
    supportedTypes: ["selection"],
    extractProps: ({ attrs }) => {
        return {
            month: attrs.month
        };
    },
};

registry.category("fields").add("day_selector", daySelector);
