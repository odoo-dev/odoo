import { _t } from "@web/core/l10n/translation";
import { x2ManyCommands } from "@web/core/orm_service";
import { registry } from "@web/core/registry";
import { mergeClasses } from "@web/core/utils/classname";
import { getId } from "@web/model/relational_model/utils";
import { x2ManyField, X2ManyField } from "@web/views/fields/x2many/x2many_field";
import { ListRenderer } from "@web/views/list/list_renderer";

const DISPLAY_TYPES = {
    NOTE: "line_note",
    RECORD: "record",
    ROOT: Symbol("root"),
    SECTION: "line_section",
    SUBSECTION: "line_subsection",
};

const SUB_SECTION_VALUE_FACTOR = 1;
const TOP_SECTION_VALUE_FACTOR = 100;

function isSection(type) {
    return [DISPLAY_TYPES.SECTION, DISPLAY_TYPES.SUBSECTION].includes(type);
}

class HierarchyItem {
    constructor(type, record, parent) {
        this.type = type;
        this.record = record;
        this.parent = parent;
        this.childItems = [];
        this.childSections = [];
    }

    get displayName() {
        return this.record.data.display_name || this.record.data.name;
    }

    get id() {
        return this.record.id;
    }

    get index() {
        const prop = this.isSection ? "childSections" : "childItems";
        return this.parent[prop].indexOf(this) + 1;
    }

    get isLastChildItem() {
        return this.index === this.parent.childItems.length;
    }

    get isNote() {
        return this.type === DISPLAY_TYPES.NOTE;
    }

    get isRoot() {
        return this.type === DISPLAY_TYPES.ROOT;
    }

    get isSection() {
        return isSection(this.type);
    }

    get isTopSection() {
        return this.type === DISPLAY_TYPES.SECTION;
    }

    get records() {
        if (this.isRoot) {
            return [
                ...this.childItems.flatMap((it) => it.records),
                ...this.childSections.flatMap((it) => it.records),
            ];
        }
        if (this.isSection) {
            return [
                this.record,
                ...this.childItems.flatMap((it) => it.records),
                ...this.childSections.flatMap((it) => it.records),
            ];
        }
        return [this.record];
    }

    get sectionValue() {
        if (!this.isSection) {
            return 0;
        }
        if (this.isTopSection) {
            return this.index * TOP_SECTION_VALUE_FACTOR;
        } else {
            return this.parentValue + this.index * SUB_SECTION_VALUE_FACTOR;
        }
    }

    addChild(item) {
        const prop = item.isSection ? "childSections" : "childItems";
        this[prop].push(item);
    }
}

class SectionListRenderer extends ListRenderer {
    static props = [
        ...super.props,
        "isM2M",
        "displayTypeField",
        "noteContentField",
        "sectionContentField",
    ];
    static recordRowTemplate = "web.SectionListRenderer.Row";

    setup() {
        super.setup();
        this.controls = [
            ...this.controls,
            {
                type: "create",
                string: _t("Add section"),
                context: this.makeSectionCreationContext(false),
            },
            {
                type: "create",
                string: _t("Add note"),
                context: this.makeNoteCreationContext(),
            },
        ];
        this.itemMap = {};
    }

    /**
     * @param {HierarchyItem} item
     * @param {boolean} isSubSection
     */
    async addRowInSection(item, isSubSection) {
        await this.props.list.leaveEditMode();
        await this.props.list.model.mutex.exec(async () => {
            const moveAfterRecord = (
                isSubSection
                    ? item.records
                    : [item.record, ...item.childItems.map((it) => it.record)]
            ).at(-1);
            const context = isSubSection ? this.makeSectionCreationContext(true) : {};
            const newRecord = await this.props.list._createNewRecordDatapoint({
                context,
                manuallyAdded: true,
                mode: "edit",
            });
            await this.props.list._addRecord(newRecord, {});
            await this.props.list._resequence(newRecord.id, moveAfterRecord.id);
            await this.props.list._onUpdate();
        });
    }

    buildHierarchy(list) {
        const itemMap = {};
        const hierarchy = new HierarchyItem(DISPLAY_TYPES.ROOT, {}, null);
        let parent = hierarchy;

        for (const record of list.records) {
            const type = record.data[this.props.displayTypeField] || DISPLAY_TYPES.RECORD;
            if (isSection(type)) {
                if (type === DISPLAY_TYPES.SECTION) {
                    parent = hierarchy;
                } else if (parent.type === DISPLAY_TYPES.SUBSECTION) {
                    parent = parent.parent;
                }
            }
            const item = new HierarchyItem(type, record, parent);
            parent.addChild(item);
            itemMap[item.id] = item;
            if (item.isSection) {
                parent = item;
            }
        }

        return { hierarchy, itemMap };
    }

    /**
     * @param {HierarchyItem} item
     */
    canAddSubSection(item) {
        const displayTypeField = this.props.list.fields[this.props.displayTypeField];
        const selection = new Map(displayTypeField.selection);
        return selection.has(DISPLAY_TYPES.SUBSECTION) && item.isTopSection;
    }

    /**
     * @param {HierarchyItem} item
     */
    async deleteSection(item) {
        if (this.editedRecord && this.editedRecord !== item) {
            const left = await this.props.list.leaveEditMode();
            if (!left) {
                return;
            }
        }
        if (this.activeActions.onDelete) {
            const method = this.props.isM2M ? "unlink" : "delete";
            const commands = item.records.map((r) =>
                x2ManyCommands[method](r.resId || r._virtualId)
            );
            await this.props.list.model.mutex.exec(async () => {
                await this.props.list._applyCommands(commands);
                await this.props.list._onUpdate();
            });
        }
    }

    /**
     * @param {HierarchyItem} item
     */
    async duplicateSection(item) {
        await this.props.list.model.mutex.exec(async () => {
            const promises = [];
            for (const record of item.records) {
                const data = { ...record.data };
                if (this.props.list.handleField) {
                    data[this.props.list.handleField] = this.props.list.records.length + 1;
                }
                const copiedRecord = this.props.list._createRecordDatapoint(data, {
                    virtualId: getId("virtual"),
                    manuallyAdded: true,
                });
                const addingPromise = this.props.list._addRecord(copiedRecord);
                promises.push(addingPromise);
            }
            await Promise.all(promises);
            await this.props.list._onUpdate();
        });
    }

    editNextRecord(record, group) {
        const item = this.getHierarchyItem(record.id);
        if (item.isSection || item.isLastChildItem) {
            return this.addRowInSection(item, false);
        } else {
            return super.editNextRecord(record, group);
        }
    }

    getHierarchyItem(id) {
        return this.itemMap[id];
    }

    getListRecords(list) {
        const { hierarchy, itemMap } = this.buildHierarchy(list);
        this.itemMap = itemMap;
        this.hierarchy = hierarchy;
        return hierarchy.records;
    }

    getNoteCellClass(column, record) {
        const cssClass = this.getCellClass(column, record);
        return mergeClasses(cssClass, "fst-italic");
    }

    getNoteRowClass(record) {
        return this.getRowClass(record);
    }

    getNoteColumns(record) {
        const columns = this.getColumns(record);
        const noteColumns = columns.filter(
            (col) =>
                col.widget === "handle" ||
                (col.type === "field" && col.name === this.props.noteContentField)
        );
        return noteColumns.map((col) => {
            if (col.name === this.props.noteContentField) {
                return { ...col, colspan: columns.length - noteColumns.length + 1 };
            } else {
                return { ...col };
            }
        });
    }

    getSectionCellClass(column, record) {
        const section = this.getHierarchyItem(record.id);
        const cssClass = this.getCellClass(column, record);
        return mergeClasses(cssClass, "fst-italic", {
            "fw-bolder": section.isTopSection,
        });
    }

    getSectionRowClass(record) {
        const section = this.getHierarchyItem(record.id);
        const cssClass = this.getRowClass(record);
        return mergeClasses(cssClass, `o_section_row_level_${section.isTopSection ? 1 : 2}`);
    }

    getSectionColumns(record) {
        const columns = this.getColumns(record);
        const sectionColumns = columns.filter(
            (col) =>
                col.widget === "handle" ||
                (col.type === "field" && col.name === this.props.sectionContentField)
        );
        return sectionColumns.map((col) => {
            if (col.name === this.props.sectionContentField) {
                return { ...col, colspan: columns.length - sectionColumns.length + 1 };
            } else {
                return { ...col };
            }
        });
    }

    isSortable() {
        return false;
    }

    makeNoteCreationContext() {
        return {
            [`default_${this.props.displayTypeField}`]: DISPLAY_TYPES.NOTE,
        };
    }

    makeSectionCreationContext(isSubSection) {
        return {
            [`default_${this.props.displayTypeField}`]: isSubSection
                ? DISPLAY_TYPES.SUBSECTION
                : DISPLAY_TYPES.SECTION,
        };
    }
}

export class SectionNoteListField extends X2ManyField {
    static props = {
        ...super.props,
        displayTypeField: String,
        noteContentField: String,
        sectionContentField: String,
    };
    static components = {
        ...super.components,
        ListRenderer: SectionListRenderer,
    };

    get rendererProps() {
        return {
            ...super.rendererProps,
            displayTypeField: this.props.displayTypeField,
            isM2M: this.isMany2Many,
            noteContentField: this.props.noteContentField,
            sectionContentField: this.props.sectionContentField,
        };
    }
}

/** @type {import("registries").FieldsRegistryItemShape} */
export const sectionNoteListField = {
    ...x2ManyField,
    component: SectionNoteListField,
    extractProps(staticInfo, dynamicInfo) {
        const props = x2ManyField.extractProps(staticInfo, dynamicInfo);
        return {
            ...props,
            displayTypeField: staticInfo.options.display_type_field,
            noteContentField: staticInfo.options.note_content_field,
            sectionContentField: staticInfo.options.section_content_field,
        };
    },
    relatedFields: (info) => {
        const relatedFields = [];
        if (info.options.displayTypeField) {
            relatedFields.push({
                name: info.options.displayTypeField,
                type: "selection",
                readonly: false,
            });
        }
        if (info.options.note_content_field) {
            relatedFields.push({
                name: info.options.note_content_field,
                type: "text",
                readonly: false,
            });
        }
        if (info.options.section_content_field) {
            relatedFields.push({
                name: info.options.section_content_field,
                type: "char",
                readonly: false,
            });
        }
        return relatedFields;
    },
};
registry.category("fields").add("section_note_list", sectionNoteListField);
