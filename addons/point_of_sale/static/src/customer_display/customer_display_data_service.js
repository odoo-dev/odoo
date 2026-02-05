import { reactive } from "@web/owl2/utils";
import { Reactive } from "@web/core/utils/reactive";
import { registry } from "@web/core/registry";
import DeviceIdentifierSequence from "@point_of_sale/app/utils/devices_identifier_sequence";
import { QrCodeCustomerDisplay } from "@point_of_sale/app/customer_display/customer_display_qr_code_popup";
import { GeneratePrinterData } from "@point_of_sale/app/utils/generate_printer_data";

export class CustomerDisplayDataService extends Reactive {
    static serviceDependencies = ["pos", "dialog"];

    constructor(env, deps) {
        super();
        this.ready = this.setup(env, deps).then(() => this);
    }
    // use setup instead of constructor because setup can be patched.
    async setup(env, { pos, dialog }) {
        this.env = env;
        this.pos = pos;

        const reactivePos = reactive(this.pos);
        window.posmodel = reactivePos;
        this.dialog = dialog;
        this.data = {};
        const currentOrder = this.pos.getOrder();
        if (currentOrder) {
            const adapter = new GeneratePrinterData(currentOrder, false);
            // this.data.displayScreenSaver = false; // disable screen saver
            this.data = { ...this.data, ...adapter.generateData() };
        }
    }

    openCustomerDisplay() {
        this.dialog.add(QrCodeCustomerDisplay, {
            customerDisplayURL: `${this.pos.config._base_url}${this.customerDisplayPath}`,
        });
    }

    get customerDisplayPath() {
        const deviceUuid = new DeviceIdentifierSequence({ orm: this.pos.data.orm }).deviceUuid;
        return `/pos_customer_display/${this.pos.config.id}/${deviceUuid}`;
    }
}

export const posCuatomerDisplayService = {
    dependencies: CustomerDisplayDataService.serviceDependencies,
    async start(env, deps) {
        return new CustomerDisplayDataService(env, deps).ready;
    },
};
registry.category("services").add("customer_display_data", posCuatomerDisplayService);
