/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardFieldProps } from "./standard_field_props";

import { ColorPickerDialog } from "@web/core/colorpicker/colorpicker_dialog";

const { Component } = owl;

export class ColorField extends Component {
    setup() {
        this.dialogService = useService("dialog");
    }

    onClick() {
        if (this.isReadonly) return;
        const self = this;
        this.dialogService.add(ColorPickerDialog, {
            onColorSelected(hex) {
                self.props.update(hex);
            },
            color: self.props.value || "#ffffff",
        });
    }

    get isReadonly() {
        return this.props.record.activeFields[this.props.name].modifiers.readonly;
    }
}
ColorField.template = "web.ColorField";

ColorField.props = {
    ...standardFieldProps,
};

registry.category("fields").add("color", ColorField);
