import {
    SectionAndNoteListRenderer,
    sectionAndNoteFieldOne2Many,
} from "@account/components/section_and_note_fields_backend/section_and_note_fields_backend";
import { _t } from "@web/core/l10n/translation";
import {
    sectionNoteListField,
    SectionListRenderer,
    SectionNoteListField,
} from "@web/views/fields/section_note_list/section_note_list_field";
import { registry } from "@web/core/registry";
import { useService } from '@web/core/utils/hooks';
import { X2ManyField, x2ManyField } from "@web/views/fields/x2many/x2many_field";
import { ProductNameAndDescriptionListRendererMixin } from "@product/product_name_and_description/product_name_and_description";
import { patch } from "@web/core/utils/patch";
import { mergeClasses } from "@web/core/utils/classname";

export class ProductLabelSectionAndNoteListRender extends SectionListRenderer {
    static recordRowTemplate = "account.SectionListRenderer.Row";

    setup() {
        super.setup();
        this.descriptionColumn = "name";
        this.productColumns = ["product_id", "product_template_id"];
        this.pricesColumns = ["price_unit", "price_subtotal", "price_total", "discount"];
        this.orm = useService("orm");
    }

    getSectionColumns(record) {
        const columns = this.getColumns(record);
        return columns.slice(0, 2).map((col) => {
            if (col.name !== 'sequence') {
                return { ...col, colspan: columns.length - 1 };
            } else {
                return { ...col };
            }
        });
    }

    processAllColumn(allColumns, list) {
        allColumns = allColumns.map((column) => {
            if (column["optional"] === "conditional" && column["name"] === "product_id") {
                /**
                 * The preference should be different for Bills & Invoices lines
                 * Invoices -> Should show the products by default
                 * Bills -> Should show the labels by default
                 */
                column["optional"] = ["in_invoice", "in_refund", "in_receipt"].includes(
                    this.props.list.evalContext.parent.move_type
                )
                    ? "hide"
                    : "show";
            }
            return column;
        });
        return super.processAllColumn(allColumns, list);
    }

    isCellReadonly(column, record) {
        // The isCellReadonly method from the ListRenderer is used to determine the classes to apply to the cell.
        // We need this override to make sure some readonly classes are not applied to the cell if it is still editable.
        let isReadonly = super.isCellReadonly(column, record);
        return (
            isReadonly
            && (["cancel", "posted"].includes(record.evalContext.parent.state)
            || record.evalContext.parent.locked)
        )
    }

    _papaSaysHide(hierarchyItem, key) {
        if (hierarchyItem.isTopSection) {
            return false;
        }

        if (hierarchyItem.isSubSection && !hierarchyItem.parent.isRoot) {
            return hierarchyItem.parent?.record.data[key];
        }

        if (hierarchyItem.isRecord || hierarchyItem.isNote) {
            const parent = hierarchyItem.parent;
            if (!parent || parent.isRoot) return false;

            if (parent.isTopSection) {
                return parent.record.data[key];
            }

            if (parent.isSubSection) {
                return parent.parent.isTopSection
                    ? parent.parent.record.data[key] || parent.record.data[key]
                    : parent.record.data[key];
            }
        }

        return false;
    }

    getDropDownItems(hierarchyItem) {
        return [
            {
                id: "deleteSelectionLine",
                label: _t("Delete Selection Line"),
                icon: "fa-trash",
                onSelected: async () => {
                    debugger;d
                    await this.orm.unlink("account.move.line", hierarchyItem.record.resIds);
                    this.env.model.load();
                },
            },
            {
                id: "toggleComposition",
                label: hierarchyItem.record.data.hide_composition ? _t("Show Composition") : _t("Hide Composition"),
                icon: hierarchyItem.record.data.hide_composition ? "fa-eye" : "fa-eye-slash",
                onSelected: async () => {
                    const changes = { hide_composition: !hierarchyItem.record.data.hide_composition };
                    await hierarchyItem.record.update(changes);
                },
            },
            {
                id: "togglePrices",
                label: hierarchyItem.record.data.hide_prices ? _t("Show Prices") : _t("Hide Prices"),
                icon: hierarchyItem.record.data.hide_prices ? "fa-eye" : "fa-eye-slash",
                onSelected: async () => {
                    const changes = { hide_prices: !hierarchyItem.record.data.hide_prices };
                    await hierarchyItem.record.update(changes);
                },
            },
        ];
    }

    getRowClass(record) {
        const item = this.getHierarchyItem(record.id);
        const cssClass = super.getRowClass(record);
        if (this._papaSaysHide(item, 'hide_composition')) {
            return mergeClasses(cssClass, `text-muted`);
        }
        return cssClass;
    }

    getSectionRowClass(record) {
        const section = this.getHierarchyItem(record.id);
        const cssClass = super.getSectionRowClass(record);
        if (this._papaSaysHide(section, 'hide_composition')) {
            return mergeClasses(cssClass, `text-muted`);
        }
        return cssClass;
    }

    getNoteRowClass(record) {
        const item = this.getHierarchyItem(record.id);
        const cssClass = super.getNoteRowClass(record);
        if (this._papaSaysHide(item, 'hide_composition')) {
            return mergeClasses(cssClass, `text-muted`);
        }
        return cssClass;
    }

    getCellClass(column, record) {
        const cssClass = super.getCellClass(column, record);
        if (this.pricesColumns.includes(column.name)) {
            const item = this.getHierarchyItem(record.id);
            if (this._papaSaysHide(item, 'hide_prices')) {
                return mergeClasses(cssClass, `text-muted`);
            }
        }
        return cssClass;
    }
}

patch(ProductLabelSectionAndNoteListRender.prototype, ProductNameAndDescriptionListRendererMixin);

export class ProductLabelSectionAndNoteOne2Many extends SectionNoteListField {
    static components = {
        ...super.components,
        ListRenderer: ProductLabelSectionAndNoteListRender,
    };
}

export const productLabelSectionAndNoteOne2Many = {
    ...sectionNoteListField,
    component: ProductLabelSectionAndNoteOne2Many,
};

registry
    .category("fields")
    .add("product_label_section_and_note_field_o2m", productLabelSectionAndNoteOne2Many);
