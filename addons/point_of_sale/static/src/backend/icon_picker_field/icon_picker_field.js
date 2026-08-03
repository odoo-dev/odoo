import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { Component } from "@odoo/owl";

export class IconPickerField extends Component {
    static template = "point_of_sale.IconPickerField";

    static props = {
        ...standardFieldProps,
        icons: { type: Array },
    };

    get icons() {
        return this.props.icons;
    }

    get value() {
        return this.props.record.data[this.props.name];
    }

    selectIcon(iconName) {
        this.props.record.update({
            [this.props.name]: iconName,
        });
    }
}

export const iconPickerField = {
    component: IconPickerField,
    supportedTypes: ["char"],
    extractProps: ({ options }) => ({
        icons: options?.icons || [],
    }),
};

registry.category("fields").add("icon_picker_pos", iconPickerField);
