import { Component, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useInputField } from "@web/views/fields/input_field_hook";
import { useNumpadDecimal } from "@web/views/fields/numpad_decimal_hook";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

const formatters = registry.category("formatters");
const parsers = registry.category("parsers");

export class ProgressBarField extends Component {
    static template = "web.ProgressBarField";
    static props = {
        ...standardFieldProps,
        maxValueField: { type: [String, Number], optional: true },
    };

    setup() {
        useNumpadDecimal();
        useInputField({
            getValue: () => this.formattedCurrentValue,
            parse: (v) => this.parseCurrentValue(v),
            refName: "currentValue",
        });
        this.state = useState({ hasFocus: false });
    }

    get currentValue() {
        return this.props.record.data[this.props.name] || 0;
    }

    get formattedCurrentValue() {
        const formatter = formatters.get(this.props.record.fields[this.props.name].type);
        return formatter(this.currentValue, { humanReadable: !this.state.hasFocus });
    }

    get formattedMaxValue() {
        const formatter = formatters.get(this.props.record.fields[this.props.maxValueField].type);
        return formatter(this.maxValue, { humanReadable: true });
    }

    get maxValue() {
        return this.props.record.data[this.props.maxValueField] || 100;
    }

    get progressBarColorClass() {
        return this.currentValue > this.maxValue ? "bg-secondary" : "bg-primary";
    }

    parseCurrentValue(value) {
        const parser = parsers.get(this.props.record.fields[this.props.name].type);
        return parser(value);
    }

    setFocused(focused) {
        this.state.hasFocus = focused;
    }
}

/** @type {import("registries").FieldsRegistryItemShape} */
export const progressBarField = {
    component: ProgressBarField,
    displayName: _t("Progress Bar"),
    fieldDependencies: ({ options }) => options.max_value_field ? [{ name: options.max_value_field, type: "integer" }] : [],
    listViewWidth: 150,
    supportedOptions: [
        {
            label: _t("Max value field"),
            name: "max_value_field",
            type: "field",
            availableTypes: ["integer", "float"],
            help: _t(
                "Field that holds the maximum value of the progress bar. If set, will be displayed next to the progress bar (e.g. 10 / 200)."
            ),
        },
    ],
    supportedTypes: ["integer", "float"],
    extractProps: ({ options }) => ({
        maxValueField: options.max_value_field,
    }),
};

registry.category("fields").add("progressbar", progressBarField);
