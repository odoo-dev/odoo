/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { qrCodeSrc } from "@point_of_sale/utils";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

patch(PaymentScreen.prototype, {
    async _postPushOrderResolve(order, order_server_ids) {
        if (this.pos.company.country_id?.code === "EG") {
            const l10n_eg_pos_qrval = await this.pos.data.searchRead(
                'pos.order',
                [['id', '=', order.id]],
                ['l10n_eg_pos_qrcode']
            )
            order.l10n_eg_qr_code = l10n_eg_pos_qrval
                ? qrCodeSrc(l10n_eg_pos_qrval[0]['l10n_eg_pos_qrcode'], 130)
                : undefined;
        }
        return super._postPushOrderResolve(...arguments);
    },
});
