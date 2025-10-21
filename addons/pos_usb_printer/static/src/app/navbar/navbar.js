/** @odoo-module **/

import { Navbar } from "@point_of_sale/app/navbar/navbar";
import { htmlToCanvas } from "@point_of_sale/app/printer/render_service";
import { renderToElement } from "@web/core/utils/render";
import { patch } from "@web/core/utils/patch";


patch(Navbar.prototype, {
    setup() {
        super.setup(...arguments);
        this.isDeskTopView = window?.printerAPI?.printReceipt ?? false;
    },
    processCanvas(canvas) {
        try {
            return canvas.toDataURL("image/png");
        } catch (err) {
            console.error("Error processing canvas:", err);
            return null;
        }
    },
    async handleCustomSaleDetails(pos) {
        try {
            const saleDetails = await pos.data.call(
                "report.point_of_sale.report_saledetails",
                "get_sale_details",
                [false, false, false, [pos.session.id]]
            );
            const report = renderToElement(
                "point_of_sale.SaleDetailsReport",
                Object.assign({}, saleDetails, {
                    date: new Date().toLocaleString(),
                    pos: pos,
                    formatCurrency: pos.env.utils.formatCurrency,
                })
            );
            const canvas = await htmlToCanvas(report, { addClass: "pos-receipt-print" });
            const image = this.processCanvas(canvas);            
            document.querySelector(".render-container")?.replaceChildren();
            if (!image) {
                pos.printer.printWeb(report);
                return false;
            }

            await window?.printerAPI?.printReceipt(image);
            return true;
        } catch (err) {
            pos.printer.printWeb(report);
            return false;
        }
    },
    async showSaleDetails() {
        try {
            if (!window?.printerAPI?.printReceipt) {
                return await super.showSaleDetails(...arguments);
            }
            await this.handleCustomSaleDetails(this.pos);
        } catch (err) {
            return await super.showSaleDetails(...arguments);
        }
    },
});
