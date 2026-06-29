import { patch } from "@web/core/utils/patch";
import OrderPaymentValidation from "@point_of_sale/app/utils/order_payment_validation";

patch(OrderPaymentValidation.prototype, {
    async afterOrderValidation() {
        await super.afterOrderValidation(...arguments);
        
        const order = this.order;
        if (!order) {
            return;
        }

        const linesToPrint = order.getOrderlines().filter(
            (line) => line.product_id?.to_print_label && !line.label_printed
        );

        if (linesToPrint.length === 0) {
            return;
        }

        const ticketPrinterService = this.pos.env.services.pos_ticket_printer;
        const zplPrinter = ticketPrinterService?.zplPrinter;

        for (const line of linesToPrint) {
            try {
                await this.pos.printZplLabel(line, zplPrinter);
            } catch (err) {
                console.error("Failed to print ZPL label for line", line, err);
            }
        }
    }
});
