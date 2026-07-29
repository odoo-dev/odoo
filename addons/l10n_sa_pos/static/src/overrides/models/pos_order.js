import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";
import { computeSAQRCode } from "@l10n_sa_pos/app/utils/qr";

patch(PosOrder.prototype, {
    export_for_printing(baseUrl, headerData) {
        const result = super.export_for_printing(...arguments);
        if (this.company.country_id?.code === "SA" && !result.is_settlement) {
            const company = this.company;
            const codeWriter = new window.ZXing.BrowserQRCodeSvgWriter();
            const qr_values = this.compute_sa_qr_code(
                company.name,
                company.vat,
                this.date_order,
                this.get_total_with_tax(),
                this.get_total_tax()
            );
            const qr_code_svg = new XMLSerializer().serializeToString(
                codeWriter.write(qr_values, 200, 200)
            );
            result.qr_code = "data:image/svg+xml;base64," + window.btoa(qr_code_svg);
        }
        return result;
    },

    compute_sa_qr_code(name, vat, date_isostring, amount_total, amount_tax) {
        return computeSAQRCode(name, vat, date_isostring, amount_total, amount_tax);
    },
});
