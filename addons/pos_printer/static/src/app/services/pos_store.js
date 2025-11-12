import { PosStore } from "@point_of_sale/app/services/pos_store";
import { PosPrinter } from "@pos_printer/app/utils/pos_printer";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    async afterProcessServerData() {
        const data = await super.afterProcessServerData(...arguments);
        if (this.config.network_printer) {
            const { device_ip, vendor_id, product_id } = this.config;
            this.hardwareProxy.printer = new PosPrinter({
                device_ip,
                vendor_id,
                product_id,
            });
        }
        return data;
    },
    createPrinter(config) {
        if (config.printer_type === "esc_pos_printer") {
            const { device_ip, vendor_id, product_id } = this.config;
            return new PosPrinter({
                device_ip,
                vendor_id,
                product_id,
            });
        }
        return super.createPrinter(...arguments);
    },
});
