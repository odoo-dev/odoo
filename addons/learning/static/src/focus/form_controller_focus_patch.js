import { onMounted, onWillUnmount, usePlugin } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { FormController } from "@web/views/form/form_controller";
import { LearningFocusPlugin } from "../services/learning_focus_plugin";

/** Counts the forms on screen, so focus mode controls only show where they matter. */
patch(FormController.prototype, {
    setup() {
        super.setup(...arguments);
        const focus = usePlugin(LearningFocusPlugin);
        onMounted(() => focus.openForms.set(focus.openForms() + 1));
        onWillUnmount(() => focus.openForms.set(focus.openForms() - 1));
    },
});
