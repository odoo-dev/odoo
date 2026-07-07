import { _t } from "@web/core/l10n/translation";
import { ColorList } from "@web/core/colorlist/colorlist";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
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
        autosave: { type: Boolean, optional: true },
    };

    setup() {
        this.dropdownState = useDropdownState();
    }

    get selectedColor() {
        return this.props.record.data[this.props.name] || 0;
    }

    get colors() {
        return ColorList.COLORS;
    }

    switchColor(colorIndex) {
        this.props.record.update(
            { [this.props.name]: colorIndex },
            { save: this.props.autosave }
        );
        this.dropdownState.close();
    }
}

export const colorPickerField = {
    component: ColorPickerField,
    supportedTypes: ["integer"],
    supportedOptions: [
        {
            label: _t("Autosave"),
            name: "autosave",
            type: "boolean",
            default: false,
        },
    ],
    extractProps: ({ viewType, options }, dynamicInfo) => {
        let autosave = false;
        if ("autosave" in options) {
            autosave = Boolean(options.autosave);
        } else if (["kanban", "list"].includes(viewType)) {
            autosave = true;
        }
        return {
            readonly: dynamicInfo.readonly,
            autosave,
        };
    },
};

registry.category("fields").add("color_picker", colorPickerField);
