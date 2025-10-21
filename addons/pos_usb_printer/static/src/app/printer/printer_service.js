/** @odoo-module **/

import {patch} from "@web/core/utils/patch";
import {PrinterService} from "@point_of_sale/app/printer/printer_service";
import {toPng, toCanvas} from "@point_of_sale/app/utils/html-to-image";
import {loadAllImages} from "@point_of_sale/utils";

const warmupHtmlToImage = async () => {
    try {
        const el = document.createElement("div");
        await toCanvas(el);
    } catch {}
};


patch(PrinterService.prototype, {
    async setup() {
        super.setup(...arguments);
        warmupHtmlToImage();
    },
    async print(component, props, options) {        
        this.state.isPrinting = true;
        const el = await this.renderer.toHtml(component, {...props, is_offline_print: true});
        try {
            await loadAllImages(el);
        } catch (e) {
            console.error("Images could not be loaded correctly", e);
        }
        try {
            if (window?.printerAPI?.printReceipt) {
                const base64Image = await toPng(el, {
                        backgroundColor: "#ffffff",
                        cacheBust: true,
                        useCORS: true,
                        allowTaint: true,
                        skipFailedImages: true,
                });
                return await window.printerAPI.printReceipt(base64Image);
            }
            
            return await this.printHtml(el, options);
        } finally {
            this.state.isPrinting = false;
        }
    },
});
