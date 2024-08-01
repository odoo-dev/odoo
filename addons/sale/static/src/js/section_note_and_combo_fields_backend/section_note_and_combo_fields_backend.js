/** @odoo-module **/

import { registry } from "@web/core/registry";
import { CharField } from "@web/views/fields/char/char_field";
import {
    listSectionAndNoteText,
    sectionAndNoteFieldOne2Many,
    sectionAndNoteText,
    ListSectionAndNoteText,
    SectionAndNoteText,
} from "@account/components/section_and_note_fields_backend/section_and_note_fields_backend";
import { getLinkedSaleOrderLines } from "../sale_utils";
import {
    productLabelSectionAndNoteOne2Many,
    ProductLabelSectionAndNoteOne2Many,
    ProductLabelSectionAndNoteListRender,
} from "@account/components/product_label_section_and_note_field/product_label_section_and_note_field";
export class SaleOrderLineListRenderer extends ProductLabelSectionAndNoteListRender {
    static template = "account.sectionAndNoteListRenderer";
    static recordRowTemplate = "sale.ListRenderer.RecordRow";

    getCellTitle(column, record) {
        // When using this list renderer, we don't want the product_id cell to have a tooltip with its label.
        if (column.name === "product_id" || column.name === "product_template_id") {
            return;
        }
        super.getCellTitle(column, record);
    }

    getActiveColumns(list) {
        let activeColumns = super.getActiveColumns(list);
        let productTmplCol = activeColumns.find((col) => col.name === "product_template_id");
        let productCol = activeColumns.find((col) => col.name === "product_id");

        if (productCol && productTmplCol) {
            // hide the template column if the variant one is enabled
            activeColumns = activeColumns.filter((col) => col.name != "product_template_id")
        }

        return activeColumns;
    }

    // TODO(loti): this method name is not ideal but I'd have to override 3 other methods otherwise.
    isSectionOrNote(record=null) {
        return super.isSectionOrNote(record) || this.isCombo(record);
    }

    getRowClass(record) {
        let classNames = super.getRowClass(record);
        if (this.isCombo(record) || this.isComboItem(record)) {
            classNames = classNames.replace('o_row_draggable', '');
        }
        // TODO(loti): this class name is not ideal but I'd have to duplicate the styles otherwise.
        return `${classNames} ${this.isCombo(record) ? 'o_is_line_section' : ''}`;
    }

    isCellReadonly(column, record) {
        return super.isCellReadonly(column, record) || (
            this.isComboItem(record) && column.name !== 'name' && column.name !== 'tax_id'
        );
    }

    async onDeleteRecord(record) {
        await super.onDeleteRecord(record);
        if (this.isCombo(record) && record.model.root.data.order_line) {
            const comboItemLineRecords = getLinkedSaleOrderLines(record);
            for (const comboItemLineRecord of comboItemLineRecords) {
                await super.onDeleteRecord(comboItemLineRecord);
            }
        }
    }

    getTitleField(record) {
        return this.isCombo(record) ? "product_template_id" : super.getTitleField(record);
    }

    isCombo(record) {
        return record.data.product_type === 'combo';
    }

    isComboItem(record) {
        return !!record.data.combo_item_id;
    }
}

export class SaleOrderLineOne2Many extends ProductLabelSectionAndNoteOne2Many {
    static components = {
        ...ProductLabelSectionAndNoteOne2Many.components,
        ListRenderer: SaleOrderLineListRenderer,
    };
}
export const saleOrderLineOne2Many = {
    ...productLabelSectionAndNoteOne2Many,
    component: SaleOrderLineOne2Many,
    additionalClasses: sectionAndNoteFieldOne2Many.additionalClasses,
};

registry
    .category("fields")
    .add("sol_o2m", saleOrderLineOne2Many);

export class SectionNoteAndComboText extends SectionAndNoteText {
    // TODO VFE see if can be removed
    static template = "account.SectionAndNoteText";
    static props = { ...SectionAndNoteText.props };

    get componentToUse() {
        return this.props.record.data.product_type === 'combo' ? CharField : super.componentToUse;
    }
}

export class ListSectionNoteAndComboText extends ListSectionAndNoteText {
    get componentToUse() {
        return this.props.record.data.product_type === 'combo' ? CharField : super.componentToUse;
    }
}

export const sectionNoteAndComboText = {
    ...sectionAndNoteText,
    component: SectionNoteAndComboText,
};

export const listSectionNoteAndComboText = {
    ...listSectionAndNoteText,
    component: ListSectionNoteAndComboText,
};

registry.category("fields").add(
    "section_note_and_combo_text", sectionNoteAndComboText
);
registry.category("fields").add(
    "list.section_note_and_combo_text", listSectionNoteAndComboText
);
