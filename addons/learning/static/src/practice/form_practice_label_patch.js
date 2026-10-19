import { patch } from "@web/core/utils/patch";
import { FormController } from "@web/views/form/form_controller";
import { PracticeLabel } from "../practice_label/practice_label";

patch(FormController, {
    components: { ...FormController.components, PracticeLabel },
});
