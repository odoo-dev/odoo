import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { renderToString } from "@web/core/utils/render";
import { _t } from "@web/core/l10n/translation";

patch(PosStore.prototype, {
    async printZplLabel(line, printer = null) {
        const uom_name = line.product_id?.uom_id?.name || "";
        const qtyParts = line.getQuantityStr();
        const qty_str = qtyParts.unitPart + (qtyParts.decimalPart ? qtyParts.decimalPoint + qtyParts.decimalPart : "");
        
        const data = {
            name: line.product_id.display_name,
            qty: `${qty_str} ${uom_name}`,
            price_unit: `${line.currencyDisplayPriceUnit} / ${uom_name}`,
            price_total: line.currencyDisplayPrice,
            barcode: line.product_id.barcode || "",
        };

        let zpl = renderToString("pos_zpl_labels.pos_product_label_zpl", data);
        // Clean up HTML entities and non-breaking spaces from QWeb/OWL rendering
        zpl = zpl.replace(/&nbsp;/g, " ")
                 .replace(/&amp;/g, "&")
                 .replace(/&lt;/g, "<")
                 .replace(/&gt;/g, ">")
                 .replace(/&quot;/g, '"')
                 .replace(/&#39;/g, "'")
                 .replace(/\xa0/g, " ");

        // If no printer passed, find the configured one from config
        if (!printer) {
            const ticketPrinterService = this.env.services.pos_ticket_printer;
            printer = ticketPrinterService?.zplPrinter;
        }

        if (printer && printer._instance) {
            try {
                this.env.services.ui.block({ message: _t("Printing label...") });
                const result = await printer._instance.print(zpl);
                this.env.services.ui.unblock();
                if (result.successful) {
                    line.label_printed = true;
                    this.env.services.notification.add(_t("Label printed successfully"), {
                        type: "success",
                    });
                    return;
                } else {
                    this.env.services.notification.add(_t("Printing error, downloading ZPL file..."), {
                        type: "warning",
                    });
                }
            } catch (err) {
                this.env.services.ui.unblock();
                console.error(err);
                this.env.services.notification.add(_t("Printing error, downloading ZPL file..."), {
                    type: "warning",
                });
            }
        }

        // Fallback: Download ZPL file
        const blob = new Blob([zpl], { type: "text/plain" });
        const link = document.createElement("a");
        const safeName = line.product_id.display_name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
        link.download = `label_${safeName}.zpl`;
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        
        // Mark as printed since we downloaded it
        line.label_printed = true;
    }
});
