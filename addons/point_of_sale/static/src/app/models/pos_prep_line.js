import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class PosPrepLine extends Base {
    static pythonModel = "pos.prep.line";
    static preProcessVals(vals, _models) {
        vals.quantity ??= 0;
    }
    get product() {
        return this.models["product.product"].get(this.pos_line_info.product_id);
    }
    get attribute_value_names() {
        return this.models["product.template.attribute.value"]
            .readMany(this.pos_line_info.attribute_value_ids)
            .map((a) => a.name);
    }
    get isCombo() {
        return Boolean(this.pos_line_info.combo_item_id);
    }
    getQuantityToShow(diffType) {
        if (diffType == "new") {
            return this.quantity;
        } else if (diffType == "cancelled") {
            return Math.abs(this.quantity);
        } else if (diffType == "line_note_update") {
            // show the quantity of the linked line in line_note_update change
            return this.pos_line_id.qty;
        } else {
            throw new Error(`Unknown type: ${diffType}`);
        }
    }
    get prevNote() {
        // look back in the history of prep line (via the prev_prep_line_id field) until an defined note is found
        let prevPrepLine = this.prev_prep_line_id;
        while (prevPrepLine) {
            if (prevPrepLine.pos_line_info.uuid === this.pos_line_info.uuid) {
                if (prevPrepLine.note) {
                    return prevPrepLine.note.map(({ text }) => text).join(", ");
                }
            }
            prevPrepLine = prevPrepLine.prev_prep_line_id;
        }
        return undefined;
    }
    isSentTo(printer) {
        return this.pos_printer_ids.some((p) => p.id === printer.id);
    }
    isForPrinter(printer) {
        return this.product.relatedPrepPrinters.some((p) => p.id === printer.id);
    }
}

registry.category("pos_available_models").add(PosPrepLine.pythonModel, PosPrepLine);
