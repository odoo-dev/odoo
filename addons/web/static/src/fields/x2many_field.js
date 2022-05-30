/** @odoo-module **/

import { evalDomain } from "@web/views/helpers/utils";
import { KanbanRenderer } from "@web/views/kanban/kanban_renderer";
import { ListRenderer } from "@web/views/list/list_renderer";
import { makeContext } from "@web/core/context";
import { Pager } from "@web/core/pager/pager";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/fields/standard_field_props";
import {
    useSelectCreate,
    useX2ManyCrud,
    useAddInlineRecord,
    useOpenX2ManyRecord,
    useActiveActions,
} from "@web/fields/relational_utils";

const { Component } = owl;

const X2M_RENDERERS = {
    list: ListRenderer,
    kanban: KanbanRenderer,
};

export class X2ManyField extends Component {
    setup() {
        this.activeField = this.props.record.activeFields[this.props.name];
        this.field = this.props.record.fields[this.props.name];

        this.isMany2Many =
            this.field.type === "many2many" || this.activeField.widget === "many2many";

        this.addButtonText = this.activeField.attrs["add-label"] || this.env._t("Add");

        this.viewMode = this.activeField.viewMode;
        this.Renderer = X2M_RENDERERS[this.viewMode];

        const { saveRecord, updateRecord, removeRecord } = useX2ManyCrud(
            () => this.list,
            this.isMany2Many
        );

        const subView = this.activeField.views[this.viewMode];
        const subViewActiveActions = subView.activeActions;
        this.activeActions = useActiveActions({
            crudOptions: Object.assign({}, this.activeField.options, {
                onDelete: removeRecord,
            }),
            isMany2Many: this.isMany2Many,
            subViewActiveActions,
            getEvalParams: () => {
                return {
                    evalContext: this.props.record.evalContext,
                    readonly: this.props.readonly,
                };
            },
        });

        if (subView.editable) {
            this.addInLine = useAddInlineRecord({
                position: subView.editable,
                addNew: (...args) => this.list.addNew(...args),
            });
        }

        const openRecord = useOpenX2ManyRecord({
            resModel: this.list.resModel,
            activeField: this.activeField,
            activeActions: this.activeActions,
            getList: () => this.list,
            saveRecord,
            updateRecord,
        });
        this._openRecord = openRecord;
        const selectCreate = useSelectCreate({
            resModel: this.props.value.resModel,
            activeActions: this.activeActions,
            onSelected: (resIds) => saveRecord(resIds),
            onCreateEdit: ({ context }) => openRecord({ context }),
        });

        this.selectCreate = (params) => {
            const p = Object.assign({}, params);
            p.domain = [...(p.domain || []), "!", ["id", "in", this.props.value.currentIds]];
            return selectCreate(p);
        };
    }

    get list() {
        return this.props.value;
    }

    get rendererProps() {
        const archInfo = this.activeField.views[this.viewMode];
        let columns;
        if (this.viewMode === "list") {
            // handle column_invisible modifiers
            // first remove (column_)invisible buttons in button_groups
            columns = archInfo.columns.map((col) => {
                if (col.type === "button_group") {
                    const buttons = col.buttons.filter((button) => {
                        return !this.evalColumnInvisibleModifier(button.modifiers);
                    });
                    return { ...col, buttons };
                }
                return col;
            });
            // then filter out (column_)invisible fields and empty button_groups
            columns = columns.filter((col) => {
                if (col.type === "field") {
                    return !this.evalColumnInvisibleModifier(col.modifiers);
                } else if (col.type === "button_group") {
                    return col.buttons.length > 0;
                }
                return true;
            });
            // filter out oe_read_only/oe_edit_only columns
            // note: remove this oe_read/edit_only logic when form view
            // will always be in edit mode
            const mode = this.props.record.mode;
            columns = columns.filter((col) => {
                if (col.type === "field") {
                    if (mode === "readonly") {
                        return !/\boe_edit_only\b/.test(col.className);
                    } else {
                        return !/\boe_read_only\b/.test(col.className);
                    }
                } else if (col.type === "button_group") {
                    if (mode === "readonly") {
                        return col.buttons.some((btn) => !/\boe_edit_only\b/.test(btn.className));
                    } else {
                        return col.buttons.some((btn) => !/\boe_read_only\b/.test(btn.className));
                    }
                }
            });
        }
        const props = {
            activeActions: this.activeActions,
            editable: !this.props.readonly && archInfo.editable,
            archInfo: { ...archInfo, columns },
            list: this.list,
            openRecord: this.openRecord.bind(this),
            onAdd: this.onAdd.bind(this),
        };
        if (this.viewMode === "kanban") {
            props.recordsDraggable = !this.props.readonly;
            props.readonly = this.props.readonly;
        }
        return props;
    }

    get displayAddButton() {
        const { canCreate, canLink } = this.activeActions;
        return (
            this.viewMode === "kanban" &&
            (canLink !== undefined ? canLink : canCreate) &&
            !this.props.readonly
        );
    }

    get pagerProps() {
        const list = this.list;
        return {
            offset: list.offset,
            limit: list.limit,
            total: list.count,
            onUpdate: async ({ offset, limit }) => {
                const initialLimit = this.list.limit;
                const unselected = await list.unselectRecord(true);
                if (unselected) {
                    if (initialLimit === limit && initialLimit === this.list.limit + 1) {
                        // Unselecting the edited record might have abandonned it. If the page
                        // size was reached before that record was created, the limit was temporarily
                        // increased to keep that new record in the current page, and abandonning it
                        // decreased this limit back to it's initial value, so we keep this into
                        // account in the offset/limit update we're about to do.
                        offset -= 1;
                        limit -= 1;
                    }
                    await list.load({ limit, offset });
                    this.render();
                }
            },
            withAccessKey: false,
        };
    }

    evalColumnInvisibleModifier(modifiers) {
        if ("column_invisible" in modifiers) {
            return evalDomain(modifiers.column_invisible, this.list.evalContext);
        }
        return false;
    }

    async openRecord(record) {
        return this._openRecord({ record, mode: this.props.readonly ? "readonly" : "edit" });
    }

    async onAdd(context) {
        const record = this.props.record;
        const domain = record.getFieldDomain(this.props.name).toList();
        if (context) {
            context = makeContext([record.getFieldContext(this.props.name), context]);
        }
        if (this.isMany2Many) {
            return this.selectCreate({ domain, context });
        }
        if (this.addInLine) {
            return this.addInLine({ context });
        }
        return this._openRecord({ context });
    }
}

X2ManyField.components = { Pager };
X2ManyField.props = { ...standardFieldProps };
X2ManyField.template = "web.X2ManyField";
X2ManyField.useSubView = true;
X2ManyField.supportedTypes = ["one2many"];
registry.category("fields").add("one2many", X2ManyField);
registry.category("fields").add("many2many", X2ManyField);
