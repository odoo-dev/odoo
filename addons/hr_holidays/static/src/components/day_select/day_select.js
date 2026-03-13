import { registry } from "@web/core/registry";
import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";
import { useEffect, useState } from "@odoo/owl";

function getDaysInMonth(month) {
    const m = parseInt(month, 10);
    if (!m || m < 1 || m > 12) return 31;
    return new Date(2020, m, 0).getDate();
}

export class DaySelectField extends SelectionField {

    static props = {
        ...SelectionField.props,
        monthField: { type: String, optional: true },
    };

    setup() {
        super.setup();
        this.ALL_DAY_OPTIONS = super.options;
        this.ALL_DAY_OPTIONS.sort((a) => parseInt(a));
        this.state = useState({
            maxDays: getDaysInMonth(this.props.record.data[this.props.monthField]),
        });

        useEffect(() => {
            const monthValue = this.props.record.data[this.props.monthField];
            this.state.maxDays = getDaysInMonth(monthValue);
        }, () => [this.props.record.data[this.props.monthField]]);
    }

    get options() {
        return this.ALL_DAY_OPTIONS.slice(0, this.state.maxDays);
    }
}

export const daySelect = {
    ...selectionField,
    component: DaySelectField,
    extractProps(fieldInfo, widget) {
        return {
            ...selectionField.extractProps(fieldInfo, widget),
            monthField: fieldInfo.attrs.month_field,
        };
    },
};

registry.category("fields").add("day_select", daySelect);
