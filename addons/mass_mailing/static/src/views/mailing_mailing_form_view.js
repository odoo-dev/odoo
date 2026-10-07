import { registry } from "@web/core/registry";
import { FormController } from "@web/views/form/form_controller";
import { formView } from "@web/views/form/form_view";

export class MailingMailingFormController extends FormController {
    async onSaveError(error, options, leaving) {
        const isMailingEditConflict =
            error.data?.name === "odoo.exceptions.RedirectWarning" &&
            error.data.arguments?.[3]?.mass_mailing_edit_conflict;
        return super.onSaveError(error, options, leaving || isMailingEditConflict);
    }
}

registry.category("views").add("mailing_mailing_form_view", {
    ...formView,
    Controller: MailingMailingFormController,
});
