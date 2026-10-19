import { usePlugin } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { Field } from "@web/views/fields/field";
import { LearningFocusPlugin } from "../services/learning_focus_plugin";
import { isFieldDimmed } from "./field_dimming";

patch(Field.prototype, {
    setup() {
        super.setup();
        this.learningFocus = usePlugin(LearningFocusPlugin);
    },

    get classNames() {
        const classNames = super.classNames;
        const { fieldInfo, name, record } = this.props;
        classNames.o_learning_dimmed = isFieldDimmed(this.learningFocus, { record, name, fieldInfo });
        return classNames;
    },
});
