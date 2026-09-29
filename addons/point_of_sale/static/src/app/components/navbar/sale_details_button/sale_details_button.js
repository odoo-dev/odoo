import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { Component, t, usePlugin, useProps } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

export class SaleDetailsButton extends Component {
    static template = "point_of_sale.SaleDetailsButton";
    props = useProps({
        isHeaderButton: t.boolean().optional(),
    });
    setup() {
        super.setup(...arguments);
        this.pos = usePos();
        this.dialog = usePlugin(DialogPlugin);
    }

    async onClick() {
        await this.pos.ticketPrinter.printSaleDetailsReceipt();
    }
}
