import { patch } from "@web/core/utils/patch";
import { IoTPrinter } from "@pos_iot/app/utils/printer/iot_printer";

patch(IoTPrinter.prototype, {
    sendPrintingJob(img) {
        if (typeof img === "string") {
            const bytes = new TextEncoder().encode(img);
            const binStr = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
            return this.action({
                document: btoa(binStr),
            });
        }
        return super.sendPrintingJob(...arguments);
    }
});
