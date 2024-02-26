/** @odoo-module **/
import { loadAllImages } from "@point_of_sale/utils";

import { Reactive } from "@web/core/utils/reactive";

export const printerService = {
    dependencies: ["renderer"],
    start(env, { renderer }) {
        return new PrinterService(env, { renderer });
    },
};
export class PrinterService extends Reactive {
    constructor(...args) {
        super(...args);
        this.setup(...args);
    }
    setup(env, { renderer }) {
        this.renderer = renderer;
        this.device = null;
        this.state = { isPrinting: false };
    }
    setPrinter(newDevice) {
        this.device = newDevice;
    }
    printWeb(el) {
        this.renderer.whenMounted({ el, callback: window.print });
        return true;
    }
    async printHtml(el, { webPrintFallback = false } = {}) {
        if (!this.device) {
            return webPrintFallback && this.printWeb(el);
        }
        const printResult = await this.device.printReceipt(el);
        if (printResult.successful) {
            return true;
        }
        throw {
            title: printResult.message.title || "Error",
            body: printResult.message.body,
        };
    }
    async print(component, props, options) {
        this.state.isPrinting = true;
        const el = await this.renderer.toHtml(component, props);
        await loadAllImages(el);
        try {
            return await this.printHtml(el, options);
        } finally {
            this.state.isPrinting = false;
        }
    }
    is = () => Boolean(this.device?.printReceipt);
}
