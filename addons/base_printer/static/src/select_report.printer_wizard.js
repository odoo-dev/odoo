import { formView } from "@web/views/form/form_view";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { FormController } from "@web/views/form/form_controller";
import { useSubEnv } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { printEmailReport } from "@base_printer/printer_report_action";

export class SelectReportPrinterFormController extends FormController {
    setup() {
        super.setup();
        this.notification = useService("notification");
        this.orm = useService("orm");
        this.onClickViewButton = this.env.onClickViewButton;

        useSubEnv({ onClickViewButton: this.onClickViewButtonPrinter.bind(this) });
    }

    async onClickViewButtonPrinter(params) {
        const selectedPrinter = this.model.root.evalContextWithVirtualIds.printer_ids;
        if (selectedPrinter.length) {
            const args = [
                this.props.context.report_id,
                this.props.context.active_ids,
                this.props.context.data,
                selectedPrinter,
            ];
            await printEmailReport(this.env, args);

            this.onClickViewButton(params);
        } else {
            this.notification.add(_t("Select at least one printer"), {
                title: _t("No printer selected"),
                type: "danger",
            });
        }
    }
}

export const selectPrinterForm = {
    ...formView,
    Controller: SelectReportPrinterFormController,
};

registry.category("views").add("select_report_printer_wizard", selectPrinterForm);
