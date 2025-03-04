import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { PrinterService } from "@point_of_sale/app/services/printer_service";
import { AlertDialog, ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { EpsonPrinter } from "@pos_epson_printer/app/utils/payment/epson_printer";

export const lablelPrinterService = {
    dependencies: ["renderer", "dialog", "orm"],
    start(env, { renderer, dialog, orm }) {
        return new LablelPrinterService(env, { dialog, renderer, orm });
    },
};
class LablelPrinterService extends PrinterService {
    constructor(...args) {
        super(...args);
        this.setup(...args);
    }
    setup(env, { dialog, renderer, orm }) {
        super.setup(...arguments);
        this.renderer = renderer;
        this.dialog = dialog;
        this.orm = orm;
    }
    async printHtml() {
        const printerIP = await this.orm.call("ir.config_parameter", "get_param", [
            "point_of_sale.epson_label_printer_ip",
        ]);
        if (!printerIP) {
            this.dialog.add(AlertDialog, {
                title: _t("IP not found"),
                body: _t("The IP for Epson Printer must be set in the General Settings."),
            });
            return;
        }
        const printer = new EpsonPrinter({ ip: printerIP });
        this.setPrinter(printer);
        try {
            return await super.printHtml(...arguments);
        } catch (error) {
            if (error.body === undefined) {
                console.error("An unknown error occured in printHtml:", error);
            }
            this.dialog.add(ConfirmationDialog, {
                title: error.title || _t("Printing error"),
            });
            return;
        }
    }
}

registry.category("services").add("label_printer", lablelPrinterService);
