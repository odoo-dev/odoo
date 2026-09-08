import { registry } from "@web/core/registry";
import { SelectionField, selectionField, selectionFieldProps } from "@web/views/fields/selection/selection_field";
import { useProps, t } from "@odoo/owl";

/**
 * Custom SelectionField component that keeps all selection choices visible in the UI
 * dropdown menu, but disables choices that are not present in the specified whitelist field.
 */
export class DisabledSelectionField extends SelectionField {
    props = useProps({
        ...selectionFieldProps,
        selection_type: t.string(),
        target_field: t.string(),
    });

    _getDaysInMonth(year, month) {
      return new Date(year, month, 0).getDate();
    }

    _allowedDays(month_val) {
        const month_int = parseInt(month_val || '1', 10);
        const max_days = this._getDaysInMonth(2020, month_int);
        return Array.from({ length: max_days }, (_, i) => String(i + 1));
    }

    _allowedMonths(day_val) {
        const day_int = parseInt(day_val || '1', 10);
        const fieldDef = this.props.record.fields[this.props.name];
        const month_keys = fieldDef && fieldDef.selection ? fieldDef.selection.map((m) => m[0]) : [];

        return month_keys.filter((m) => {
            const max_days = this._getDaysInMonth(2020, parseInt(m, 10));
            return max_days >= day_int;
        });
    }

    get _lookup_whitelist_fn() {
        return {
            days: (month_value) => this._allowedDays(month_value),
            months: (day_value) => this._allowedMonths(day_value)
        }
    }

    get choices() {
        const target_field = this.props.target_field;
        const target_value = target_field ? this.props.record.data[target_field] : null;
        const selection_type = this.props.selection_type;

        const allowedValues = this._lookup_whitelist_fn[selection_type]?.(target_value) ?? null;

        return this.options.map(([value, label]) => {
            // check if the choice's value is in the whitelist array in order to enable/disable the selection item associated
            const isEnabled = allowedValues !== null ? allowedValues.includes(String(value)) : true;

            return {
                value,
                label,
                enabled: isEnabled,
            };
        });
    }

}

export const disabledSelectionField = {
    ...selectionField,
    component: DisabledSelectionField,

    extractProps({ options }) {
        const props = selectionField.extractProps(...arguments);
        props.selection_type = options.selection_type;
        props.target_field = options.target_field;

        return props;
    },
};

registry.category("fields").add("disabled_selection", disabledSelectionField);
