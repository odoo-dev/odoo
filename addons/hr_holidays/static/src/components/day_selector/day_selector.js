import { t, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import {
    SelectionField,
    selectionField,
    selectionFieldProps,
} from "@web/views/fields/selection/selection_field";

export const daySelectorFieldProps = {
    ...selectionFieldProps,
    dependant: t.string()
};

export class DaySelector extends SelectionField {
    props = useProps({
        ...daySelectorFieldProps
    });

    getAvailableDays() {
        const month = this.getMonth(this.props.dependant);

        switch(month) {
            case '2':
                return [...Array(29).keys()].map(i => ([String(i + 1), String(i + 1)]));
            case '4':
            case '6':
            case '9':
            case '11':
                return [...Array(30).keys()].map(i => ([String(i + 1), String(i + 1)]));
            default:
                return [...Array(31).keys()].map(i => ([String(i + 1), String(i + 1)]));
        }
    }

    getMonth(variable) {
        return this.props.record.data?.[variable] || "";
    }

    /**
     * @override
     */
    get options() {
        return this.getAvailableDays();
    }
}

export const daySelectionField = {
    ...selectionField,
    component: DaySelector,
    displayName: _t("Day Selection"),
    supportedTypes: ["selection"],
    supportedOptions: [
        {
            label: "Dependant Field",
            name: "dependant",
            type: "string",
        },
    ],
    extractProps({ options }) {
        const props = selectionField.extractProps(...arguments);
        props.dependant = options.dependant;
        return props;
    },
}

registry.category("fields").add("day_selector", daySelectionField);
