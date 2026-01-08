/** @odoo-module **/

import { registry } from "@web/core/registry";
import { SelectionField } from "@web/views/fields/selection/selection_field";
export class AccrualDayField extends SelectionField {
    get monthField() {
        const fieldName = this.props.name;
        if (fieldName === 'first_month_day') return 'first_month';
        if (fieldName === 'second_month_day') return 'second_month';
        if (fieldName === 'yearly_day') return 'yearly_month';
        return null;
    }

    get maxDays() {
        const monthField = this.monthField;
        if (!monthField) return 31;
        
        const month = parseInt(this.props.record.data[monthField] || 1);
        const daysInMonth = new Date(2020, month, 0).getDate();
        return daysInMonth;
    }

    get options() {
        const maxDays = this.maxDays;
        const options = [];
        for (let i = 1; i <= maxDays; i++) {
            options.push([String(i), String(i)]);
        }
        return options;
    }

    get value() {
        const raw = super.value;
        const maxDays = this.maxDays;
        if (raw && parseInt(raw) > maxDays) {
            const clamped = String(maxDays);
            this.props.record.update({ [this.props.name]: clamped });
            return clamped;
        }
        return raw;
    }

    onChange(value) {
        const maxDays = this.maxDays;
        const stringValue = value === null ? null : String(value);
        const clamped = stringValue !== null && parseInt(stringValue) > maxDays
            ? String(maxDays)
            : stringValue;
        super.onChange(clamped ?? null);
    }
}

export const accrualDayField = {
    component: AccrualDayField,
    supportedTypes: ["selection"],
};

registry.category("fields").add("accrual_day", accrualDayField);
