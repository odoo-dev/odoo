import { formView } from "@web/views/form/form_view";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class MailComposerSaveTemplateFormController extends formView.Controller {
    /** @override */
    setup() {
        super.setup();
        this.actionService = useService("action");
    }

    /** @override */
    afterExecuteActionButton(clickParams) {
        if (clickParams.special !== "cancel") {
            return super.afterExecuteActionButton(...arguments);
        }
        return this.actionService.doActionButton({
            type: "object",
            name: "cancel_save_template",
            resId: this.model.root.resId,
            resModel: this.model.root.resModel,
        });
    }
}

registry.category("views").add("mail_composer_save_template_form", {
    ...formView,
    Controller: MailComposerSaveTemplateFormController,
});
