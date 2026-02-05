import { StarPrinter } from "@pos_star_printer/app/utils/printer/star_printer";
import { PosTicketPrinterService } from "@point_of_sale/app/services/pos_ticket_printer_service";
import { patch } from "@web/core/utils/patch";

patch(PosTicketPrinterService.prototype, {
    async createPrinterInstance(printer) {
        if (printer.printer_type === "star_epos") {
            return new StarPrinter({ printer });
        }
        return await super.createPrinterInstance(...arguments);
    },
});
