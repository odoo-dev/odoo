import { onPatched, proxy, signal, t, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { X2ManyField, x2ManyField } from "@web/views/fields/x2many/x2many_field";
import { formatFloat } from "@web/views/fields/formatters";
import { parseFloat } from "@web/views/fields/parsers";
import { ListRenderer, listRendererProps } from "@web/views/list/list_renderer";
import { x2ManyCommands } from "@web/core/orm_plugin";
import {
    resequence,
    saveSectionTemplate,
    swapBlocks,
    useSavedSections,
} from "../bom_line_one2many/bom_line_one2many";

function many2oneId(value) {
    if (!value) {
        return false;
    }
    return Array.isArray(value) ? value[0] : value.id;
}

const SECTION_ROW_PREFIX = "mrp_section_row_";

function sectionKey(record) {
    return record.data.production_section_key || false;
}

/**
 * Components of a manufacturing order, under the sections of its bill of
 * materials: above the components of each section, a row like the one of the
 * section on the bill of materials, with its name and its quantity (under the
 * quantity to consume), both editable (changing the quantity scales its
 * components), and its menu: move it (with its components) up or down, or save
 * it to add it again.
 */
export class MrpProductionComponentsListRenderer extends ListRenderer {
    static recordRowTemplate = "mrp.ProductionComponentsListRenderer.RecordRow";
    static createRowTemplate = "mrp.SectionsCreateRow";
    props = useProps({ ...listRendererProps, parentRecord: t.any() });
    sectionInputRef = signal.ref();

    setup() {
        super.setup();
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.savedSections = useSavedSections(this);
        // the field of the section being edited (an input in place of its value)
        this.sectionEdition = proxy({ sectionId: null, fieldName: null, focus: false });
        onPatched(() => {
            if (this.sectionEdition.focus && this.sectionInputRef()) {
                this.sectionEdition.focus = false;
                this.sectionInputRef().focus();
                this.sectionInputRef().select();
            }
        });
    }

    /** Only saved sections can be added (a section is shown above its components). */
    get canAddEmptySection() {
        return false;
    }

    get sections() {
        return this.props.parentRecord?.data.production_section_ids?.records || [];
    }

    /** The section starting at this component (its first component), if any. */
    getSectionAbove(record) {
        const key = sectionKey(record);
        if (!key) {
            return null;
        }
        const records = this.props.list.records;
        const index = records.indexOf(record);
        if (index > 0 && sectionKey(records[index - 1]) === key) {
            return null;
        }
        return this.sections.find((section) => section.data.key === key) || null;
    }

    /** The components of the section starting at this component (until another key). */
    getBlock(firstRecord) {
        const records = this.props.list.records;
        const key = sectionKey(firstRecord);
        const block = [];
        for (let index = records.indexOf(firstRecord); index < records.length; index++) {
            if (sectionKey(records[index]) !== key) {
                break;
            }
            block.push(records[index]);
        }
        return block;
    }

    /** The components just above (of another section, or without section). */
    getPreviousBlock(firstRecord) {
        const records = this.props.list.records;
        const index = records.indexOf(firstRecord);
        const previous = records[index - 1];
        if (!previous) {
            return null;
        }
        let start = index - 1;
        while (start > 0 && sectionKey(records[start - 1]) === sectionKey(previous)) {
            start--;
        }
        return this.getBlock(records[start]);
    }

    /** The components just below (of another section, or without section). */
    getNextBlock(firstRecord) {
        const records = this.props.list.records;
        const block = this.getBlock(firstRecord);
        const next = records[records.indexOf(block.at(-1)) + 1];
        return next ? this.getBlock(next) : null;
    }

    /** The id of the row of the section starting at this component (to drag it). */
    getSectionRowId(firstRecord) {
        return `${SECTION_ROW_PREFIX}${firstRecord.id}`;
    }

    /**
     * Dropping the row of a section moves it with its components: after the
     * section (or the components without section) the row is dropped after.
     *
     * @override
     */
    async sortDrop(dataRowId, params) {
        if (!dataRowId?.startsWith(SECTION_ROW_PREFIX)) {
            return super.sortDrop(dataRowId, params);
        }
        const { element } = params;
        let { previous } = params;
        const list = this.props.list;
        const records = list.records;
        const firstRecord = records.find((r) => r.id === dataRowId.slice(SECTION_ROW_PREFIX.length));
        element.classList.remove("o_row_draggable");
        try {
            if (!firstRecord || !(await list.leaveEditMode({ canAbandon: false }))) {
                return;
            }
            const block = this.getBlock(firstRecord);
            // the dropped row itself (and the components it carries) is not a reference
            while (previous && (previous === element || block.some((r) => r.id === previous.dataset.id))) {
                previous = previous.previousElementSibling;
            }
            let after = null; // the component the block is moved after (null: on top)
            if (previous?.dataset.id?.startsWith(SECTION_ROW_PREFIX)) {
                // dropped right below the row of another section: before it
                const sectionFirst = records.find(
                    (r) => r.id === previous.dataset.id.slice(SECTION_ROW_PREFIX.length)
                );
                after = records[records.indexOf(sectionFirst) - 1] || null;
            } else if (previous?.dataset.id) {
                // dropped among components: after the end of their section
                const record = records.find((r) => r.id === previous.dataset.id);
                after = record ? this.getBlockOf(record).at(-1) : null;
            }
            if (after && block.includes(after)) {
                return;
            }
            const others = records.filter((r) => !block.includes(r));
            const index = after ? others.indexOf(after) + 1 : 0;
            await resequence(list, [...others.slice(0, index), ...block, ...others.slice(index)]);
        } finally {
            element.classList.add("o_row_draggable");
        }
    }

    /** The components of the section (or without section) this component is in. */
    getBlockOf(record) {
        const records = this.props.list.records;
        let start = records.indexOf(record);
        while (start > 0 && sectionKey(records[start - 1]) === sectionKey(record)) {
            start--;
        }
        return this.getBlock(records[start]);
    }

    async moveSectionUp(firstRecord) {
        const previous = this.getPreviousBlock(firstRecord);
        if (!previous || !(await this.props.list.leaveEditMode({ canAbandon: false }))) {
            return;
        }
        await swapBlocks(this.props.list, this.props.list.records, this.getBlock(firstRecord), previous);
    }

    async moveSectionDown(firstRecord) {
        const next = this.getNextBlock(firstRecord);
        if (!next || !(await this.props.list.leaveEditMode({ canAbandon: false }))) {
            return;
        }
        await swapBlocks(this.props.list, this.props.list.records, next, this.getBlock(firstRecord));
    }

    /** Removes the section with its components. */
    async removeSection(firstRecord) {
        const section = this.getSectionAbove(firstRecord);
        if (!section || !(await this.props.list.leaveEditMode({ canAbandon: false }))) {
            return;
        }
        await this.props.list.applyCommands(
            this.getBlock(firstRecord).map((move) =>
                x2ManyCommands.delete(move.resId || move._virtualId)
            )
        );
        await this.props.parentRecord.data.production_section_ids.applyCommands([
            x2ManyCommands.delete(section.resId || section._virtualId),
        ]);
    }

    async saveSection(firstRecord) {
        const section = this.getSectionAbove(firstRecord);
        if (!section || !(await this.props.list.leaveEditMode({ canAbandon: false }))) {
            return;
        }
        // quantities for one unit of finished product
        const productionQty = this.props.parentRecord?.data.product_qty || 1;
        const lines = this.getBlock(firstRecord)
            .filter((move) => move.data.product_id)
            .map((move, index) => [
                0,
                0,
                {
                    sequence: index + 1,
                    product_id: many2oneId(move.data.product_id),
                    product_qty: move.data.product_uom_qty / productionQty,
                    uom_id: many2oneId(move.data.uom_id) || undefined,
                },
            ]);
        await saveSectionTemplate(this, section.data.name, section.data.product_qty, lines);
    }

    /**
     * The cells of the row of a section, as on the bill of materials: the
     * handle, the name over the columns before the quantity to consume, the
     * quantity under it, then nothing.
     */
    getSectionCells() {
        const columns = this.columns;
        let handleCount = 0;
        while (handleCount < columns.length && columns[handleCount].widget === "handle") {
            handleCount++;
        }
        const qtyIndex = columns.findIndex((col) => col.name === "product_uom_qty");
        const leadingCount = (this.hasSelectors ? 1 : 0) + handleCount;
        const handleIndexes = Array.from({ length: handleCount }, (_value, index) => index);
        if (qtyIndex <= handleCount) {
            return { handleIndexes, nameSpan: this.nbCols - leadingCount, hasQty: false, tailSpan: 0 };
        }
        const nameSpan = qtyIndex - handleCount;
        return {
            handleIndexes,
            nameSpan,
            hasQty: true,
            tailSpan: this.nbCols - leadingCount - nameSpan - 1,
        };
    }

    get canEditSections() {
        return !this.props.readonly;
    }

    isEditingSection(section, fieldName) {
        return (
            this.sectionEdition.sectionId === section.id &&
            this.sectionEdition.fieldName === fieldName
        );
    }

    editSection(section, fieldName) {
        if (!this.canEditSections || this.isEditingSection(section, fieldName)) {
            return;
        }
        Object.assign(this.sectionEdition, { sectionId: section.id, fieldName, focus: true });
    }

    stopEditingSection() {
        Object.assign(this.sectionEdition, { sectionId: null, fieldName: null, focus: false });
    }

    onSectionInputKeydown(ev) {
        if (ev.key === "Enter" || ev.key === "Escape") {
            ev.preventDefault();
            ev.stopPropagation();
            ev.target.blur();
        }
    }

    formatSectionQty(section) {
        return formatFloat(section.data.product_qty, {
            digits: section.fields.product_qty.digits,
        });
    }

    async updateSectionName(section, value) {
        this.stopEditingSection();
        if (value !== (section.data.name || "")) {
            await section.update({ name: value });
        }
    }

    async updateSectionQty(section, value) {
        this.stopEditingSection();
        let quantity;
        try {
            quantity = parseFloat(value);
        } catch {
            return;
        }
        if (quantity < 0 || quantity === section.data.product_qty) {
            return;
        }
        await section.update({ product_qty: quantity });
    }
}

export class MrpProductionComponentsOne2ManyField extends X2ManyField {
    static components = {
        ...X2ManyField.components,
        ListRenderer: MrpProductionComponentsListRenderer,
    };

    get rendererProps() {
        const props = super.rendererProps;
        if (this.props.viewMode === "list") {
            props.parentRecord = this.props.record;
        }
        return props;
    }
}

registry.category("fields").add("mrp_production_components_one2many", {
    ...x2ManyField,
    component: MrpProductionComponentsOne2ManyField,
    additionalClasses: [...(x2ManyField.additionalClasses || []), "o_field_one2many"],
});
