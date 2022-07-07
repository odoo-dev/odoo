/** @odoo-module **/
import { FormLabel } from "@web/views/form/form_label";
import { HighlightText } from "./highlight_text";

export class FormLabelHighlightText extends FormLabel {
    setup() {
        super.setup();
    }
    get className() {
        if (this.props.className) {
            return this.props.className;
        }
        return super.className;
    }
}

FormLabelHighlightText.template = "web.FormLabelHighlightText";
FormLabelHighlightText.components = { HighlightText };
