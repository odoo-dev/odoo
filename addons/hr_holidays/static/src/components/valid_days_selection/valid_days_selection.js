import { t, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import {
    SelectionField,
    selectionField,
    selectionFieldProps,
} from "@web/views/fields/selection/selection_field";

export class ValidDaysSelectionField extends SelectionField {
    props = useProps({
        ...selectionFieldProps,
        month: t.string(),
    });

    get options() {
        const month = parseInt(this.props.record.data[this.props.month]);
        if (!month) {
            return super.options;
        }
        // 2020 is a leap year, so February accepts the 29th
        const lastDay = new Date(2020, month, 0).getDate();
        return super.options.filter(([value]) => parseInt(value) <= lastDay);
    }
}

export const validDaysSelectionField = {
    ...selectionField,
    component: ValidDaysSelectionField,
    additionalClasses: ["o_field_selection"],
    displayName: _t("Day of the Month Selection"),
    supportedOptions: [
        {
            label: _t("Selected Month"),
            name: "month",
            type: "field",
            availableTypes: ["selection"],
        },
    ],
    extractProps({ options }) {
        const props = selectionField.extractProps(...arguments);
        props.month = options.month;
        return props;
    },
};

registry.category("fields").add("valid_days_selection", validDaysSelectionField);
