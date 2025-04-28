import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { PrinterService } from "@base_printer/epson_printer/services/printer_service";
import { AlertDialog, ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { EpsonPrinter } from "@base_printer/epson_printer/printer/epson_printer";

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
    async print(component, props, options = {}, printerIp = "") {
        this.epson_printer_ip = printerIp;
        return super.print(...arguments);
    }
    async printHtml() {
        const printer = new EpsonPrinter({ ip: this.epson_printer_ip });
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
