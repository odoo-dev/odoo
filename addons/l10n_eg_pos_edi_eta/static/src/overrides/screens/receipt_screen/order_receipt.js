import { patch } from "@web/core/utils/patch";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { useBus } from "@web/core/utils/hooks";
import { useState, onWillStart } from "@odoo/owl";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";

patch(OrderReceipt.prototype, {
    setup() {
        super.setup(...arguments);
        this.pos = usePos();
        this.eta_data = useState({
            qr_code: ''
        });
        onWillStart(this.loadETAData);
        useBus(this.pos.bus, 'order_synchronized', this.loadETAData);
        useBus(this.pos.bus, 'receipt_submitted', this.loadETAData);
    },
    async loadETAData() {
        const order = this.pos.get_order();
        const countryCode = order.country_code;
        if (countryCode === 'EG' && !order.to_invoice) {
            const orderId = this.pos.validated_orders_name_server_id_map[order.name]
            if (orderId) {
                const eta_result = await this.pos.data.searchRead(
                    'pos.order',
                    [['id', '=', orderId]],
                    ['l10n_eg_pos_qrcode']
                )
                this.eta_data.qr_code = eta_result[0]['l10n_eg_pos_qrcode'];
            }
        }
    },
})
