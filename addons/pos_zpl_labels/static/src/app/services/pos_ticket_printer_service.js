import { patch } from "@web/core/utils/patch";
import { PosTicketPrinterService } from "@point_of_sale/app/services/pos_ticket_printer_service";

patch(PosTicketPrinterService.prototype, {
    get zplPrinter() {
        return this.config.zpl_printer_id || null;
    },
    async initPrinters() {
        await super.initPrinters(...arguments);
        const zplPrinter = this.zplPrinter;
        if (zplPrinter && !zplPrinter._instance) {
            zplPrinter._instance = await this.createPrinterInstance(zplPrinter);
        }
    }
});
