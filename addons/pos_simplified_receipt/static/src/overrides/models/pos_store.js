import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";

patch(PosStore.prototype, {
    async printReceipt({ type = 'full', order = this.get_order(), printBillActionTriggered = false } = {}){
        const data = this.orderExportForPrinting(order, type);
        const result = await this.printer.print(
            OrderReceipt,
            {
                data,
                formatCurrency: this.env.utils.formatCurrency,
                basic_receipt: type === 'basic',
            },
            { webPrintFallback: true }
        );
        if(!printBillActionTriggered){
            order.nb_print += 1;
            if(typeof order.id === "number" && result){
                await this.data.write("pos.order", [order.id], { nb_print: order.nb_print });
            }
        }
        return true;
    },

    orderExportForPrinting(order, type = 'full'){
        const res = super.orderExportForPrinting(...arguments);
        if(type === 'simplified'){
            debugger
            const guestCount = order.getCustomerCount();
            const amountPerGuest = res.orderlines?.[0].price.slice(0,2).toString() + (order.get_total_without_tax() / guestCount).toString();
            const price = amountPerGuest.substring(0, amountPerGuest.indexOf("."));
            const newLines = [];
            for(let i =1; i<= guestCount; i++){
                newLines.push({
                  productName: `Guest ${i}`,
                  qty: "1.0",
                  price: price,
                  unitPrice: price,
                  unit: "Units",
                });
            }
            res.orderlines = newLines;
            debugger
            return res;
        }
        return res;
    }

})