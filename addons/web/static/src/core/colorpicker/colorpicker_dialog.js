/** @odoo-module */

import { Dialog } from "../dialog/dialog";
import { ColorPicker } from "./colorpicker";
import { _lt } from "../l10n/translation";

export class ColorPickerDialog extends Dialog {
    setup() {
        super.setup();
        this.title = _lt("Pick a color");
        this.currentlySelectedColor = this.props.color;
    }

    onColorSelected({ hex }) {
        this.currentlySelectedColor = hex;
    }

    discard() {
        this.close();
    }

    choose() {
        this.props.onColorSelected(this.currentlySelectedColor);
        this.close();
    }
}

ColorPickerDialog.components = { ColorPicker };
ColorPickerDialog.props = {
    color: { type: String, optional: true },
    close: Function,
    isActive: Boolean,
    onColorSelected: Function,
};
ColorPickerDialog.defaultProps = {
    color: "#ff0000",
};

ColorPickerDialog.bodyTemplate = "web.ColorPickerDialogBody";
ColorPickerDialog.footerTemplate = "web.ColorPickerDialogFooter";
ColorPickerDialog.size = "modal-sm";
