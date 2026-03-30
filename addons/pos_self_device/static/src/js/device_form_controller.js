import { registry } from "@web/core/registry";
import { FormController } from "@web/views/form/form_controller";
import { useService } from "@web/core/utils/hooks";
import { formView } from "@web/views/form/form_view";
import { onWillUnmount } from "@odoo/owl";

export class DeviceFormController extends FormController {
    setup() {
        super.setup();
        this.busService = useService("bus_service");
        const channel = "pos_self_device_" + this.props.resId;
        this.busService.addChannel(channel);

        const callback = this._onBusMessage.bind(this);
        this.busService.subscribe("pos_self_device_ui_update", callback);

        onWillUnmount(() => {
            this.busService.unsubscribe("pos_self_device_ui_update", callback);
            this.busService.deleteChannel(channel);
        });
    }

    _onBusMessage(payload) {
        this._reloadRecord();
    }

    async _reloadRecord() {
        if (!this.model?.root) {
            return;
        }

        // Reload the current record
        await this.model.root.load();
    }
}

registry.category("views").add("pos_self_device_form_controller", {
    ...formView,
    Controller: DeviceFormController,
});
