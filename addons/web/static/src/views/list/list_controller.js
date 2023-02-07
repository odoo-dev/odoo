/** @odoo-module */

import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { download } from "@web/core/network/download";
import { evaluateExpr } from "@web/core/py_js/py";
import { unique } from "@web/core/utils/arrays";
import { useService } from "@web/core/utils/hooks";
import { omit } from "@web/core/utils/objects";
import { sprintf } from "@web/core/utils/strings";
import { ActionMenus } from "@web/search/action_menus/action_menus";
import { Layout } from "@web/search/layout";
import { usePager } from "@web/search/pager_hook";
import { session } from "@web/session";
import { useModel } from "@web/views/model";
import { DynamicRecordList } from "@web/views/relational_model";
import { standardViewProps } from "@web/views/standard_view_props";
import { MultiRecordViewButton } from "@web/views/view_button/multi_record_view_button";
import { ViewButton } from "@web/views/view_button/view_button";
import { useViewButtons } from "@web/views/view_button/view_button_hook";
import { ExportDataDialog } from "@web/views/view_dialogs/export_data_dialog";
import { useSetupView } from "@web/views/view_hook";

import { Component, onMounted, onWillStart, useEffect, useRef, useSubEnv } from "@odoo/owl";

// -----------------------------------------------------------------------------

export class ListController extends Component {
    setup() {
        this.actionService = useService("action");
        this.dialogService = useService("dialog");
        this.notificationService = useService("notification");
        this.userService = useService("user");
        this.rpc = useService("rpc");
        this.rootRef = useRef("root");

        this.archInfo = this.props.archInfo;
        this.editable = this.props.editable ? this.archInfo.editable : false;
        this.multiEdit = this.archInfo.multiEdit;
        this.activeActions = this.archInfo.activeActions;
        const fields = this.props.fields;
        const { rootState } = this.props.state || {};
        const { defaultGroupBy, rawExpand } = this.archInfo;
        this.model = useModel(this.props.Model, {
            resModel: this.props.resModel,
            fields,
            activeFields: this.archInfo.activeFields,
            fieldNodes: this.archInfo.fieldNodes,
            handleField: this.archInfo.handleField,
            viewMode: "list",
            groupByInfo: this.archInfo.groupBy.fields,
            limit: this.archInfo.limit || this.props.limit,
            countLimit: this.archInfo.countLimit,
            defaultOrder: this.archInfo.defaultOrder,
            defaultGroupBy: this.props.searchMenuTypes.includes("groupBy") ? defaultGroupBy : false,
            expand: rawExpand ? evaluateExpr(rawExpand, this.props.context) : false,
            groupsLimit: this.archInfo.groupsLimit,
            multiEdit: this.multiEdit,
            rootState,
            onRecordSaved: this.onRecordSaved.bind(this),
            onWillSaveRecord: this.onWillSaveRecord.bind(this),
        });

        onWillStart(async () => {
            this.isExportEnable = await this.userService.hasGroup("base.group_allow_export");
        });

        onMounted(() => {
            const { rendererScrollPositions } = this.props.state || {};
            if (rendererScrollPositions) {
                const renderer = this.rootRef.el.querySelector(".o_list_renderer");
                renderer.scrollLeft = rendererScrollPositions.left;
                renderer.scrollTop = rendererScrollPositions.top;
            }
        });

        this.archiveEnabled =
            "active" in fields
                ? !fields.active.readonly
                : "x_active" in fields
                ? !fields.x_active.readonly
                : false;
        useSubEnv({ model: this.model }); // do this in useModel?
        useViewButtons(this.model, this.rootRef, {
            beforeExecuteAction: this.beforeExecuteActionButton.bind(this),
            afterExecuteAction: this.afterExecuteActionButton.bind(this),
        });
        useSetupView({
            rootRef: this.rootRef,
            beforeLeave: async () => {
                const list = this.model.root;
                const editedRecord = list.editedRecord;
                if (editedRecord) {
                    if (!(await list.unselectRecord(true))) {
                        return false;
                    }
                }
            },
            beforeUnload: async (ev) => {
                const editedRecord = this.model.root.editedRecord;
                if (editedRecord) {
                    const isValid = await editedRecord.urgentSave();
                    if (!isValid) {
                        ev.preventDefault();
                        ev.returnValue = "Unsaved changes";
                    }
                }
            },
            getLocalState: () => {
                const renderer = this.rootRef.el.querySelector(".o_list_renderer");
                return {
                    rootState: this.model.root.exportState(),
                    rendererScrollPositions: { left: renderer.scrollLeft, top: renderer.scrollTop },
                };
            },
            getOrderBy: () => {
                return this.model.root.orderBy;
            },
        });

        usePager(() => {
            const list = this.model.root;
            const { count, hasLimitedCount, isGrouped, limit, offset } = list;
            return {
                offset: offset,
                limit: limit,
                total: count,
                onUpdate: async ({ offset, limit }, hasNavigated) => {
                    if (this.model.root.editedRecord) {
                        if (!(await this.model.root.editedRecord.save())) {
                            return;
                        }
                    }
                    await list.load({ limit, offset });
                    this.render(true); // FIXME WOWL reactivity
                    if (hasNavigated) {
                        this.onPageChangeScroll();
                    }
                },
                updateTotal: !isGrouped && hasLimitedCount ? () => list.fetchCount() : undefined,
            };
        });

        useEffect(
            () => {
                if (this.props.onSelectionChanged) {
                    const resIds = this.model.root.selection.map((record) => record.resId);
                    this.props.onSelectionChanged(resIds);
                }
            },
            () => [this.model.root.selection.length]
        );
    }

    /**
     * onRecordSaved is a callBack that will be executed after the save
     * if it was done. It will therefore not be executed if the record
     * is invalid or if a server error is thrown.
     * @param {Record} record
     */
    async onRecordSaved(record) {}

    /**
     * onWillSaveRecord is a callBack that will be executed before the
     * record save if the record is valid if the record is valid.
     * If it returns false, it will prevent the save.
     * @param {Record} record
     */
    async onWillSaveRecord(record) {}

    async createRecord({ group } = {}) {
        const list = (group && group.list) || this.model.root;
        if (this.editable) {
            if (!(list instanceof DynamicRecordList)) {
                throw new Error("List should be a DynamicRecordList");
            }
            if (list.editedRecord) {
                await list.editedRecord.save();
            }
            if (!list.editedRecord) {
                await (group || list).createRecord({}, this.editable === "top");
            }
            this.render();
        } else {
            await this.props.createRecord();
        }
    }

    async openRecord(record) {
        if (this.archInfo.openAction) {
            this.actionService.doActionButton({
                name: this.archInfo.openAction.action,
                type: this.archInfo.openAction.type,
                resModel: record.resModel,
                resId: record.resId,
                resIds: record.resIds,
                context: record.context,
                onClose: async () => {
                    await record.model.root.load();
                    record.model.notify();
                },
            });
        } else {
            const activeIds = this.model.root.records.map((datapoint) => datapoint.resId);
            this.props.selectRecord(record.resId, { activeIds });
        }
    }

    onActionExecuted() {
        const { root } = this.model;
        root.load({
            selectedIds: root.selection.map((record) => record.resId) || [],
        });
    }

    onClickCreate() {
        this.createRecord();
    }

    onClickDiscard() {
        const editedRecord = this.model.root.editedRecord;
        if (editedRecord.isVirtual) {
            this.model.root.removeRecord(editedRecord);
        } else {
            editedRecord.discard();
        }
    }

    onClickSave() {
        this.model.root.editedRecord.save();
    }

    onMouseDownDiscard(mouseDownEvent) {
        const list = this.model.root;
        list.blockUpdate = true;
        document.addEventListener(
            "mouseup",
            (mouseUpEvent) => {
                if (mouseUpEvent.target !== mouseDownEvent.target) {
                    list.blockUpdate = false;
                    list.multiSave(list.editedRecord);
                }
            },
            { capture: true, once: true }
        );
    }

    onPageChangeScroll() {
        if (this.rootRef && this.rootRef.el) {
            this.rootRef.el.querySelector(".o_content").scrollTop = 0;
        }
    }

    getSelectedResIds() {
        return this.model.root.getResIds(true);
    }

    getStaticActionMenuItems() {
        const isM2MGrouped = this.model.root.isM2MGrouped;
        return {
            export: {
                isAvailable: () => this.isExportEnable,
                sequence: 10,
                description: this.env._t("Export"),
                callback: () => this.onExportData(),
            },
            archive: {
                isAvailable: () => this.archiveEnabled && !isM2MGrouped,
                sequence: 20,
                description: this.env._t("Archive"),
                callback: () => {
                    const dialogProps = {
                        body: this.env._t(
                            "Are you sure that you want to archive all the selected records?"
                        ),
                        confirm: () => {
                            this.toggleArchiveState(true);
                        },
                        cancel: () => {},
                    };
                    this.dialogService.add(ConfirmationDialog, dialogProps);
                },
            },
            unarchive: {
                isAvailable: () => this.archiveEnabled && !isM2MGrouped,
                sequence: 30,
                description: this.env._t("Unarchive"),
                callback: () => this.toggleArchiveState(false),
            },
            delete: {
                isAvailable: () => this.activeActions.delete && !isM2MGrouped,
                sequence: 40,
                description: this.env._t("Delete"),
                callback: () => this.onDeleteSelectedRecords(),
            },
        };
    }

    get actionMenuItems() {
        const { actionMenus } = this.props.info;
        const staticActionItems = Object.entries(this.getStaticActionMenuItems())
            .filter(([key, item]) => item.isAvailable === undefined || item.isAvailable())
            .sort(([k1, item1], [k2, item2]) => (item1.sequence || 0) - (item2.sequence || 0))
            .map(([key, item]) => Object.assign({ key }, omit(item, "isAvailable", "sequence")));

        return {
            action: [...staticActionItems, ...(actionMenus.action || [])],
            print: actionMenus.print,
        };
    }

    async onSelectDomain() {
        this.model.root.selectDomain(true);
        if (this.props.onSelectionChanged) {
            const resIds = await this.model.root.getResIds(true);
            this.props.onSelectionChanged(resIds);
        }
    }

    onUnselectAll() {
        this.model.root.selection.forEach((record) => {
            record.toggleSelection(false);
        });
        this.model.root.selectDomain(false);
    }

    get className() {
        return this.props.className;
    }

    get nbSelected() {
        return this.model.root.selection.length;
    }

    get isPageSelected() {
        const root = this.model.root;
        return root.selection.length === root.records.length;
    }

    get isDomainSelected() {
        return this.model.root.isDomainSelected;
    }

    get nbTotal() {
        const list = this.model.root;
        return list.isGrouped ? list.nbTotalRecords : list.count;
    }

    get defaultExportList() {
        return unique(
            this.props.archInfo.columns
                .filter((col) => col.type === "field")
                .map((col) => this.props.fields[col.name])
                .filter((field) => field.exportable !== false)
        );
    }

    get display() {
        if (!this.env.isSmall) {
            return this.props.display;
        }
        const { controlPanel } = this.props.display;
        return {
            ...this.props.display,
            controlPanel: {
                ...controlPanel,
                "bottom-right": !this.nbSelected,
            },
        };
    }

    async downloadExport(fields, import_compat, format) {
        let ids = false;
        if (!this.isDomainSelected) {
            const resIds = await this.getSelectedResIds();
            ids = resIds.length > 0 && resIds;
        }
        const exportedFields = fields.map((field) => ({
            name: field.name || field.id,
            label: field.label || field.string,
            store: field.store,
            type: field.field_type || field.type,
        }));
        if (import_compat) {
            exportedFields.unshift({ name: "id", label: this.env._t("External ID") });
        }
        await download({
            data: {
                data: JSON.stringify({
                    import_compat,
                    context: this.props.context,
                    domain: this.model.root.domain,
                    fields: exportedFields,
                    groupby: this.model.root.groupBy,
                    ids,
                    model: this.model.root.resModel,
                }),
            },
            url: `/web/export/${format}`,
        });
    }

    async getExportedFields(model, import_compat, parentParams) {
        return await this.rpc("/web/export/get_fields", {
            ...parentParams,
            model,
            import_compat,
        });
    }

    /**
     * Opens the Export Dialog
     *
     * @private
     */
    async onExportData() {
        const dialogProps = {
            context: this.props.context,
            defaultExportList: this.defaultExportList,
            download: this.downloadExport.bind(this),
            getExportedFields: this.getExportedFields.bind(this),
            root: this.model.root,
        };
        this.dialogService.add(ExportDataDialog, dialogProps);
    }
    /**
     * Export Records in a xls file
     *
     * @private
     */
    async onDirectExportData() {
        await this.downloadExport(this.defaultExportList, false, "xlsx");
    }
    /**
     * Called when clicking on 'Archive' or 'Unarchive' in the sidebar.
     *
     * @private
     * @param {boolean} archive
     * @returns {Promise}
     */
    async toggleArchiveState(archive) {
        let resIds;
        const isDomainSelected = this.model.root.isDomainSelected;
        const total = this.model.root.count;
        if (archive) {
            resIds = await this.model.root.archive(true);
        } else {
            resIds = await this.model.root.unarchive(true);
        }
        if (
            isDomainSelected &&
            resIds.length === session.active_ids_limit &&
            resIds.length < total
        ) {
            this.notificationService.add(
                sprintf(
                    this.env._t(
                        "Of the %d records selected, only the first %d have been archived/unarchived."
                    ),
                    resIds.length,
                    total
                ),
                { title: this.env._t("Warning") }
            );
        }
    }

    async onDeleteSelectedRecords() {
        const root = this.model.root;
        const body =
            root.isDomainSelected || root.selection.length > 1
                ? this.env._t("Are you sure you want to delete these records?")
                : this.env._t("Are you sure you want to delete this record?");
        const dialogProps = {
            body,
            confirm: async () => {
                const total = root.count;
                const resIds = await this.model.root.deleteRecords();
                this.model.notify();
                if (
                    root.isDomainSelected &&
                    resIds.length === session.active_ids_limit &&
                    resIds.length < total
                ) {
                    this.notificationService.add(
                        sprintf(
                            this.env._t(
                                `Only the first %s records have been deleted (out of %s selected)`
                            ),
                            resIds.length,
                            total
                        ),
                        { title: this.env._t("Warning") }
                    );
                }
            },
            cancel: () => {},
        };
        this.dialogService.add(ConfirmationDialog, dialogProps);
    }

    discardSelection() {
        this.model.root.records.forEach((record) => {
            record.toggleSelection(false);
        });
    }

    async beforeExecuteActionButton(clickParams) {
        if (clickParams.special !== "cancel" && this.model.root.editedRecord) {
            return this.model.root.editedRecord.save();
        }
    }

    async afterExecuteActionButton(clickParams) {}
}

ListController.template = `web.ListView`;
ListController.components = { ActionMenus, Layout, ViewButton, MultiRecordViewButton };
ListController.props = {
    ...standardViewProps,
    allowSelectors: { type: Boolean, optional: true },
    editable: { type: Boolean, optional: true },
    onSelectionChanged: { type: Function, optional: true },
    showButtons: { type: Boolean, optional: true },
    Model: Function,
    Renderer: Function,
    buttonTemplate: String,
    archInfo: Object,
};
ListController.defaultProps = {
    allowSelectors: true,
    createRecord: () => {},
    editable: true,
    selectRecord: () => {},
    showButtons: true,
};
