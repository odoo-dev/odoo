import { usePlugin } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { formView } from "@web/views/form/form_view";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

export class HrUserPreferencesController extends formView.Controller {
    setup() {
        super.setup();
        this.action = usePlugin(ActionPlugin);
        this.mustReload = false;
    }

    onWillSaveRecord(record, changes) {
        this.mustReload = "lang" in changes;
    }

    async onRecordSaved(record) {
        await super.onRecordSaved(...arguments);
        if (this.mustReload) {
            this.mustReload = false;
            return this.action.doAction("reload_context");
        }
    }
}

registry.category("views").add("hr_user_preferences_form", {
    ...formView,
    Controller: HrUserPreferencesController,
});
