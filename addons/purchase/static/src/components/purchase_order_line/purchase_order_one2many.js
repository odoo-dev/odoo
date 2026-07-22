import { registry } from "@web/core/registry";
import {
    ProductLabelSectionAndNoteOne2Many,
    productLabelSectionAndNoteOne2Many,
} from "@account/components/product_label_section_and_note_field/product_label_section_and_note_field_o2m";
import { PurchaseOrderListRenderer } from "./purchase_product_label_section_and_note_field_o2m";

export class PurchaseOrderOne2Many extends ProductLabelSectionAndNoteOne2Many {
    static components = {
        ...super.components,
        ListRenderer: PurchaseOrderListRenderer,
    };
}

export const purchaseOrderOne2Many = {
    ...productLabelSectionAndNoteOne2Many,
    component: PurchaseOrderOne2Many,
};

registry.category("fields").add("purchase_qty_received_one2many", purchaseOrderOne2Many);
