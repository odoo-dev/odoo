import { ProductLabelSectionAndNoteListRender } from "@account/components/product_label_section_and_note_field/product_label_section_and_note_field_o2m";

export class PurchaseOrderListRenderer extends ProductLabelSectionAndNoteListRender {
    isLockedPurchaseLine(record) {
        return record.resModel === "purchase.order.line" && record.evalContext?.parent?.locked;
    }

    isInlineEditable(_record) {
        return this.isLockedPurchaseLine(_record) || super.isInlineEditable(_record);
    }

    isCellReadonly(column, record) {
        if (this.isLockedPurchaseLine(record) && column.name !== "qty_received") {
            return true;
        }
        return super.isCellReadonly(column, record);
    }

    getFieldProps(record, column) {
        const props = super.getFieldProps(record, column);
        if (this.isLockedPurchaseLine(record) && column.name === "qty_received") {
            // Ignore the one2many readonly state while preserving all other readonly conditions.
            props.readonly = this.isCellReadonly(column, record) || this.isRecordReadonly(record);
        }

        return props;
    }
}
