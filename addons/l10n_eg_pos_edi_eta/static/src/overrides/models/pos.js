import {PosStore} from "@point_of_sale/app/store/pos_store";
import {patch} from "@web/core/utils/patch";

patch(PosStore.prototype, {
    get isEgyptianCountry() {
        return this.company.country_id?.code === "EG";
    },
    postSyncAllOrders(orders) {
        if (this.isEgyptianCountry) {
        }
        return super.postSyncAllOrders(orders);
    },
    getReceiptHeaderData(order) {
        const result = super.getReceiptHeaderData(...arguments);
        const company = this.company;
        if (order && this.isEgyptianCountry) {
            result.is_settlement = this.get_order().is_settlement();
            if (!result.is_settlement) {
                const codeWriter = new window.ZXing.BrowserQRCodeSvgWriter();
                const qr_values = order.compute_sa_qr_code(
                    company.name,
                    company.vat,
                    order.date_order,
                    order.get_total_with_tax(),
                    order.get_total_tax()
                );
                const qr_code_svg = new XMLSerializer().serializeToString(
                    codeWriter.write(qr_values, 150, 150)
                );
                result.qr_code = "data:image/svg+xml;base64," + window.btoa(qr_code_svg);
            }
        }
        return result;
    }
});
