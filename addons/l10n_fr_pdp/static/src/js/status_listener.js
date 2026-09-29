import { BusPlugin } from "@bus/services/bus_plugin";
import { formView } from "@web/views/form/form_view";
import { FormController } from "@web/views/form/form_controller";
import { ORM } from "@web/core/orm_plugin";
import { registry } from "@web/core/registry";
import { onMounted, usePlugin } from "@odoo/owl";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

export class KycStatusFormController extends FormController {
    orm = usePlugin(ORM);

    setup() {
        super.setup();
        this.busService = usePlugin(BusPlugin);
        this.action = usePlugin(ActionPlugin);

        onMounted(() => {
            this.busService.subscribe("auth_done", async (data) => {
                if (data.pdp_registration_id !== this.recordId) {
                    return;
                }
                const action = await this.orm.call(
                    "pdp.registration",
                    "display_status_notification_from_uuid",
                    [this.recordId]
                );
                this.action.doAction(action);
            });
        });
    }

    get recordId() {
        return this.props.resId;
    }
}

export const kycStatusFormView = {
    ...formView,
    Controller: KycStatusFormController,
};

registry.category("views").add("pdp_status_listener", kycStatusFormView);
