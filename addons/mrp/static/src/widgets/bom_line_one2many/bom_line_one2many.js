import { onWillStart, proxy, t, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { x2ManyCommands } from "@web/core/orm_plugin";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { X2ManyField, x2ManyField } from "@web/views/fields/x2many/x2many_field";
import { ListRenderer, listRendererProps } from "@web/views/list/list_renderer";

function many2oneId(value) {
    if (!value) {
        return false;
    }
    return Array.isArray(value) ? value[0] : value.id;
}

/**
 * Moves the records of the block (a section and its lines) before the ones of
 * the other block, and resequences all the records of the list.
 *
 * @param {Object} list the static list
 * @param {Object[]} records the records of the list, in their order
 * @param {Object[]} movedBlock
 * @param {Object[]} otherBlock the block just before the moved block
 */
export async function swapBlocks(list, records, movedBlock, otherBlock) {
    const start = records.indexOf(otherBlock[0]);
    const end = records.indexOf(movedBlock.at(-1));
    await resequence(list, [
        ...records.slice(0, start),
        ...movedBlock,
        ...otherBlock,
        ...records.slice(end + 1),
    ]);
}

/**
 * Sets the sequences of the records of the list in this order.
 *
 * @param {Object} list the static list
 * @param {Object[]} reordered all the records of the list, in their new order
 */
export async function resequence(list, reordered) {
    const handleField = list.handleField || "sequence";
    const commands = [];
    reordered.forEach((record, index) => {
        if (record.data[handleField] !== index + 1) {
            commands.push(
                x2ManyCommands.update(record.resId || record._virtualId, {
                    [handleField]: index + 1,
                })
            );
        }
    });
    await list.applyCommands(commands, { sort: true });
}

/**
 * The saved sections, offered by the "Add a section" control (with a new
 * section, on bills of materials): adding one adds the section with its
 * components to the document (saved first).
 *
 * @param {Object} component the list renderer (with the parentRecord prop)
 */
export function useSavedSections(component) {
    const orm = useService("orm");
    const savedSections = proxy({
        records: [],
        loaded: false,
        async load() {
            savedSections.records = await orm.searchRead("mrp.section.template", [], ["name"]);
            savedSections.loaded = true;
        },
        /** The saved section of this name, if any. */
        get(name) {
            return savedSections.records.find((template) => template.name === (name || _t("Section")));
        },
        async remove(template) {
            await orm.unlink("mrp.section.template", [template.id]);
            await savedSections.load();
        },
        async add(template) {
            const list = component.props.list;
            const document = component.props.parentRecord;
            if (!document || !(await list.leaveEditMode({ canAbandon: false }))) {
                return;
            }
            if (!(await document.save())) {
                return;
            }
            await orm.call("mrp.section.template", "add_to_document", [
                [template.id],
                document.resModel,
                document.resId,
            ]);
            await document.load();
        },
    });
    onWillStart(() => {
        // not awaited: the list does not wait for it
        savedSections.load();
    });
    return savedSections;
}

/**
 * Components of a bill of materials, with sections (as on sales orders): the
 * row of a section shows its name, over the columns before the quantity, and its
 * quantity (changing it scales the components of the section). Its menu moves
 * it (with its components) up or down, or saves it to add it again.
 */
export class MrpBomLineListRenderer extends ListRenderer {
    static recordRowTemplate = "mrp.BomLineListRenderer.RecordRow";
    static createRowTemplate = "mrp.SectionsCreateRow";
    props = useProps({ ...listRendererProps, parentRecord: t.any() });

    setup() {
        super.setup();
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.savedSections = useSavedSections(this);
    }

    /** A new (empty) section can be added, besides the saved ones. */
    get canAddEmptySection() {
        return true;
    }

    isSection(record) {
        return record.data.display_type === "line_section";
    }

    getColumns(record) {
        const columns = super.getColumns(record);
        const nameColumn = this.allColumns.find((col) => col.name === "name");
        if (!this.isSection(record) || !nameColumn) {
            return columns;
        }
        const handleColumns = columns.filter((col) => col.widget === "handle");
        const otherColumns = columns.filter((col) => col.widget !== "handle");
        const qtyIndex = otherColumns.findIndex((col) => col.name === "product_qty");
        // the name column is hidden (column_invisible), except on the rows of sections
        const sectionNameColumn = { ...nameColumn, invisible: "False" };
        if (qtyIndex <= 0) {
            return [...handleColumns, { ...sectionNameColumn, colspan: otherColumns.length }];
        }
        return [
            ...handleColumns,
            { ...sectionNameColumn, colspan: qtyIndex },
            otherColumns[qtyIndex],
            // nothing else on a section (unit, operation, ...)
            ...otherColumns.slice(qtyIndex + 1).map((col) => ({ ...col, invisible: "True" })),
        ];
    }

    getRowClass(record) {
        const classNames = super.getRowClass(record);
        return this.isSection(record) ? `${classNames} o_is_line_section` : classNames;
    }

    /** The section and its lines (until the next section). */
    getSectionBlock(section) {
        const records = this.props.list.records;
        const block = [section];
        for (let index = records.indexOf(section) + 1; index < records.length; index++) {
            if (this.isSection(records[index])) {
                break;
            }
            block.push(records[index]);
        }
        return block;
    }

    getPreviousSection(section) {
        const records = this.props.list.records;
        for (let index = records.indexOf(section) - 1; index >= 0; index--) {
            if (this.isSection(records[index])) {
                return records[index];
            }
        }
        return null;
    }

    getNextSection(section) {
        const block = this.getSectionBlock(section);
        const records = this.props.list.records;
        const next = records[records.indexOf(block.at(-1)) + 1];
        return next && this.isSection(next) ? next : null;
    }

    /** The block just above: the previous section, or the lines before the first section. */
    getPreviousBlock(section) {
        const records = this.props.list.records;
        const index = records.indexOf(section);
        if (index <= 0) {
            return null;
        }
        const previous = this.getPreviousSection(section);
        return previous ? this.getSectionBlock(previous) : records.slice(0, index);
    }

    async moveSectionUp(section) {
        const previous = this.getPreviousBlock(section);
        if (!previous || !(await this.props.list.leaveEditMode({ canAbandon: false }))) {
            return;
        }
        const records = this.props.list.records;
        await swapBlocks(this.props.list, records, this.getSectionBlock(section), previous);
    }

    async moveSectionDown(section) {
        const next = this.getNextSection(section);
        if (!next || !(await this.props.list.leaveEditMode({ canAbandon: false }))) {
            return;
        }
        const records = this.props.list.records;
        await swapBlocks(this.props.list, records, this.getSectionBlock(next), this.getSectionBlock(section));
    }

    async saveSection(section) {
        if (!(await this.props.list.leaveEditMode({ canAbandon: false }))) {
            return;
        }
        // quantities for one unit of finished product
        const bomQty = this.props.list._parent?.data?.product_qty || 1;
        const lines = this.getSectionBlock(section)
            .slice(1)
            .filter((line) => line.data.product_id)
            .map((line, index) => [
                0,
                0,
                {
                    sequence: index + 1,
                    product_id: many2oneId(line.data.product_id),
                    product_qty: line.data.product_qty / bomQty,
                    uom_id: many2oneId(line.data.uom_id) || undefined,
                },
            ]);
        await saveSectionTemplate(this, section.data.name, section.data.product_qty, lines);
    }

    /** Removes the section with its components. */
    async removeSection(section) {
        if (!(await this.props.list.leaveEditMode({ canAbandon: false }))) {
            return;
        }
        const method = this.activeActions.unlink ? "unlink" : "delete";
        await this.props.list.applyCommands(
            this.getSectionBlock(section).map((record) =>
                x2ManyCommands[method](record.resId || record._virtualId)
            )
        );
    }
}

/**
 * Saves the section, to add it again on bills of materials and manufacturing
 * orders, or unsaves it if it is saved.
 */
export async function saveSectionTemplate(component, name, quantity, lines) {
    name = name || _t("Section");
    // a saved section (by its name) is unsaved
    const existing = component.savedSections?.get(name);
    if (existing) {
        await component.orm.unlink("mrp.section.template", [existing.id]);
        component.notification.add(_t("The section “%s” is no longer saved.", name), {
            type: "info",
        });
    } else {
        await component.orm.create("mrp.section.template", [
            { name, product_qty: quantity || 1, line_ids: lines },
        ]);
        component.notification.add(_t("The section “%s” is saved.", name), { type: "success" });
    }
    await component.savedSections?.load();
}

export class MrpBomLineOne2ManyField extends X2ManyField {
    static components = {
        ...X2ManyField.components,
        ListRenderer: MrpBomLineListRenderer,
    };

    get rendererProps() {
        const props = super.rendererProps;
        if (this.props.viewMode === "list") {
            props.parentRecord = this.props.record;
        }
        return props;
    }
}

registry.category("fields").add("mrp_bom_line_one2many", {
    ...x2ManyField,
    component: MrpBomLineOne2ManyField,
    additionalClasses: [...(x2ManyField.additionalClasses || []), "o_field_one2many"],
});
