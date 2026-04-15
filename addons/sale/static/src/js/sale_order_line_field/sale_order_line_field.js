import {
    productLabelSectionAndNoteOne2Many,
    ProductLabelSectionAndNoteOne2Many,
} from "@account/components/product_label_section_and_note_field/product_label_section_and_note_field_o2m";
import {
    listSectionAndNoteText,
    ListSectionAndNoteText,
    sectionAndNoteFieldOne2Many,
    sectionAndNoteText,
    SectionAndNoteText,
} from "@account/components/section_and_note_fields_backend/section_and_note_fields_backend";
import { registry } from "@web/core/registry";
import { CharField } from "@web/views/fields/char/char_field";
import { SaleOrderLineListRenderer } from "./sale_order_line_list_renderer/sale_order_line_list_renderer";

export class SaleOrderLineOne2Many extends ProductLabelSectionAndNoteOne2Many {
    static template = "sale.SaleOrderLineOne2Many";

    static components = {
        ...ProductLabelSectionAndNoteOne2Many.components,
        ListRenderer: SaleOrderLineListRenderer,
    };
}

export class SaleOrderLineText extends SectionAndNoteText {
    get componentToUse() {
        return this.props.record.data.product_type === "combo" ? CharField : super.componentToUse;
    }
}

export class ListSaleOrderLineText extends ListSectionAndNoteText {
    get componentToUse() {
        return this.props.record.data.product_type === "combo" ? CharField : super.componentToUse;
    }
}

export const saleOrderLineOne2Many = {
    ...productLabelSectionAndNoteOne2Many,
    component: SaleOrderLineOne2Many,
    additionalClasses: sectionAndNoteFieldOne2Many.additionalClasses,
};

export const saleOrderLineText = {
    ...sectionAndNoteText,
    component: SaleOrderLineText,
};

export const listSaleOrderLineText = {
    ...listSectionAndNoteText,
    component: ListSaleOrderLineText,
};

registry.category("fields").add("sol_o2m", saleOrderLineOne2Many);
registry.category("fields").add("sol_text", saleOrderLineText);
registry.category("fields").add("list.sol_text", listSaleOrderLineText);
