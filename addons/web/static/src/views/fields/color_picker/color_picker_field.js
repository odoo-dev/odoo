import { ColorList } from "@web/core/colorlist/colorlist";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

import { Component } from "@odoo/owl";

export class ColorPickerField extends Component {
    static template = "web.ColorPickerField";
    static components = {
        ColorList,
        Dropdown,
    };
    static props = {
        ...standardFieldProps,
        canToggle: { type: Boolean },
    };

    static RECORD_COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

    get isExpanded() {
        return !this.props.canToggle && !this.props.readonly;
    }

    get selectedColor() {
        return this.props.record.data[this.props.name] || 0;
    }

    switchColor(colorIndex) {
        this.props.record.update({ [this.props.name]: colorIndex });
    }
}

export const colorPickerField = {
    component: ColorPickerField,
    supportedTypes: ["integer"],
    extractProps: ({ viewType }) => ({
        canToggle: viewType !== "list",
    }),
};

registry.category("fields").add("color_picker", colorPickerField);
