import { usePlugin } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { FormLabel } from "@web/views/form/form_label";
import { LearningFocusPlugin } from "../services/learning_focus_plugin";
import { isFieldDimmed } from "./field_dimming";

/** A dimmed field's label is dimmed too. */
patch(FormLabel.prototype, {
    setup() {
        super.setup();
        this.learningFocus = usePlugin(LearningFocusPlugin);
    },

    get className() {
        const { fieldInfo, fieldName, record } = this.props;
        const dimmed = isFieldDimmed(this.learningFocus, { record, name: fieldName, fieldInfo });
        return dimmed ? `${super.className} o_learning_dimmed` : super.className;
    },
});
