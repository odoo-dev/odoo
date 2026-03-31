import { useSubEnv } from "@web/owl2/utils";
import { formView } from "@web/views/form/form_view";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { FormController } from "@web/views/form/form_controller";
import { onWillUnmount } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

export class SelectPrinterFormController extends FormController {
    setup() {
        super.setup();
        this.notification = useService("notification");
        this.orm = useService("orm");
        this.onClickViewButton = this.env.onClickViewButton;

        onWillUnmount(() => {
            // If the user closes the popup without selecting a printer we still send a message back
            this.env.bus.trigger("printer-selected-proxy", {
                reportId: this.props.context.report_id,
                deviceSettings: null,
            });
        });
        useSubEnv({ onClickViewButton: this.onClickViewButtonProxy.bind(this) });
    }

    async onClickViewButtonProxy(params) {
        const deviceSettings = {
            selectedDevices: this.model.root.evalContextWithVirtualIds.printer_id,
            skipDialog: this.model.root.evalContextWithVirtualIds.do_not_ask_again,
        };
        if (deviceSettings.selectedDevices) {
            this.env.bus.trigger("printer-selected-proxy", {
                reportId: this.props.context.report_id,
                deviceSettings,
            });
            this.onClickViewButton(params);
        } else {
            this.notification.add(_t("Select at printer"), {
                title: _t("No printer selected"),
                type: "danger",
            });
        }
    }
}

export const selectPrinterForm = {
    ...formView,
    Controller: SelectPrinterFormController,
};

registry.category("views").add("select_printer_wizard", selectPrinterForm);
