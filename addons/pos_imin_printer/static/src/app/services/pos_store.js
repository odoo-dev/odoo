import { PosStore } from "@point_of_sale/app/services/pos_store";
import { IminPrinterAdapter } from "@pos_imin_printer/app/utils/imin_printer";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    afterProcessServerData() {
        const self = this;
        return super.afterProcessServerData(...arguments).then(function () {
            if (self.config.other_devices && self.config.enable_imin_printer) {
                self.hardwareProxy.printer = new IminPrinterAdapter();
            }
        });
    },
});
