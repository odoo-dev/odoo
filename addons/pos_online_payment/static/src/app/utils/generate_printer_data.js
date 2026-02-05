import { patch } from "@web/core/utils/patch";
import { GeneratePrinterData } from "@point_of_sale/app/utils/generate_printer_data";

patch(GeneratePrinterData.prototype, {
    generateData() {
        const data = super.generateData(...arguments);
        data.onlinePaymentData = { ...(this.order?.onlinePaymentData || {}) };
        return data;
    },
});
