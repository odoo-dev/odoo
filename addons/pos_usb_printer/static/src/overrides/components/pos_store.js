/** @odoo-module **/

import {patch} from "@web/core/utils/patch";
import {PosStore} from "@point_of_sale/app/store/pos_store";
import {OrderReceipt} from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import {toPng,toCanvas} from "@point_of_sale/app/utils/html-to-image";
import {loadAllImages} from "@point_of_sale/utils";

const warmupHtmlToImage = async () => {
    try {
        const el = document.createElement("div");
        await toCanvas(el);
    } catch {}
};

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        warmupHtmlToImage();
    },
    async printReceipt({basic = false, order = this.get_order(), printBillActionTriggered = false} = {}) {
        try {
            if (!window?.printerAPI?.printReceipt) {
                return (await super.printReceipt(...arguments)) ?? true;
            }
            const rendererService = this.env?.services?.renderer;
            if (!rendererService) {
                return (await super.printReceipt(...arguments)) ?? true;
            }
            const rendererProps = {
                data: this.orderExportForPrinting(order),
                formatCurrency: this.env?.utils?.formatCurrency ?? ((v) => v),
                basic_receipt: basic,
                is_offline_print: true
            };
            const el = await rendererService.toHtml(OrderReceipt, rendererProps);
            if (!el) {
                return (await super.printReceipt(...arguments)) ?? true;
            }
            try {
                await loadAllImages(el);
            } catch {
            }
            const base64Image = await toPng(el, {
                backgroundColor: "#ffffff",
                cacheBust: true,
                useCORS: true,
                allowTaint: true,
                skipFailedImages: true,
            });
            await window.printerAPI.printReceipt(base64Image);
            if (!printBillActionTriggered) {
                order.nb_print += 1;
                if (typeof order.id === "number") {
                    await this.data.write("pos.order", [order.id], {nb_print: order.nb_print});
                }
            }
            return true;
        } catch (err) {
            console.error("Unexpected error in printReceipt:", err);
            return (await super.printReceipt(...arguments)) ?? true;
        }
    },
});
