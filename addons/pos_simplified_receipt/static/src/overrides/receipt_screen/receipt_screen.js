import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { patch } from "@web/core/utils/patch";
import { usePos } from "@point_of_sale/app/store/pos_hook";


patch(ReceiptScreen.prototype, {
    setup() {
        super.setup();
        this.pos = usePos();
    },
    async onClick() {
        const order = this.pos.get_order();
        const guestCount = order.getCustomerCount();
        console.log("guestCount", guestCount);

        await this.pos.printReceipt({ type: 'simplified', order });

        console.log("over")
    },
})