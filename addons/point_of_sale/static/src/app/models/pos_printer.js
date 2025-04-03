import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class PosPrinter extends Base {
    static pythonModel = "pos.printer";
    /**
     * Relies on the presence of `hwProxy` props. Its value is assigned during the loading of data.
     */
    send(toPrint) {
        if (!this.hwProxy) {
            throw new Error("This printer object can't print.");
        }
        return this.hwProxy.printReceipt(toPrint);
    }
}

registry.category("pos_available_models").add(PosPrinter.pythonModel, PosPrinter);
