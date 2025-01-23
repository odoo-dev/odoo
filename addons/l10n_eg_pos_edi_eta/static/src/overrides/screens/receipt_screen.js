import { patch } from "@web/core/utils/patch";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";

patch(ReceiptScreen.prototype, {
    async printReceipt() {
        const order = this.pos.get_order();

        const result = order.to_invoice
            ? await this.pos.fiscalPrinter.printFiscalInvoice()
            : await this.pos.fiscalPrinter.printFiscalReceipt();

        if (result.success) {
            this.pos.data.write("pos.order", [order.id], {
                it_fiscal_receipt_number: result.addInfo.fiscalReceiptNumber,
                it_fiscal_receipt_date: result.addInfo.fiscalReceiptDate,
                it_z_rep_number: result.addInfo.zRepNumber,
                //update the number of times the order got printed, handling undefined
                nb_print: order.nb_print ? order.nb_print + 1 : 1,
            });
            return true;
        }
    },
});
