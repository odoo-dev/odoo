/** @odoo-module */

import { useOwnedDialogs, useService } from "@web/core/utils/hooks";
import { SelectCreateDialog } from "@web/views/view_dialogs/select_create_dialog";
import { FormViewDialog } from "@web/views/view_dialogs/form_view_dialog";
import { sprintf } from "@web/core/utils/strings";
import { makeContext } from "@web/core/context";
import { FormArchParser } from "@web/views/form/form_arch_parser";
import { loadSubViews } from "@web/views/form/form_controller";
import { evalDomain } from "@web/views/helpers/utils";
import { useBus, useChildRef } from "../core/utils/hooks";
import { useViewButtons } from "../views/view_button/hook";
import { createElement } from "../core/utils/xml";
import { Dialog } from "../core/dialog/dialog";
import { FormRenderer } from "../views/form/form_renderer";
import { ViewButton } from "../views/view_button/view_button";

//
// Commons
//
export function useSelectCreate({ resModel, activeActions, onSelected, onCreateEdit }) {
    const env = owl.useEnv();
    const addDialog = useOwnedDialogs();

    function selectCreate({ domain, context, filters, title }) {
        addDialog(SelectCreateDialog, {
            title: title || env._t("Select records"),
            noCreate: !activeActions.canCreate,
            multiSelect: activeActions.canLink, // LPE Fixme
            resModel,
            context,
            domain,
            onSelected,
            onCreateEdit: () => onCreateEdit({ context }),
            dynamicFilters: filters,
        });
    }
    return selectCreate;
}

//
// Many2X
//
export function useOpenMany2XRecord({
    resModel,
    onRecordSaved,
    activeField,
    activeActions,
    isToMany,
}) {
    const env = owl.useEnv();
    const addDialog = useOwnedDialogs();
    const orm = useService("orm");

    return async function openDialog({ resId = false, title, context }, immediate = false) {
        let viewId;
        if (resId !== false) {
            viewId = await orm.call(resModel, "get_formview_id", [[resId]], {
                context,
            });
        }

        let onClose = () => {};
        if (!title) {
            title = resId ? env._t("Open %s") : env._t("Create %s");
            title = sprintf(title, activeField.string);
        }

        const { canCreate, canWrite } = activeActions;

        const mode = (resId ? canWrite : canCreate) ? "edit" : "readonly";

        addDialog(
            FormViewDialog,
            {
                context,
                mode,
                resId,
                resModel,
                viewId,
                onRecordSaved,
                isToMany,
            },
            {
                onClose: () => onClose(),
            }
        );

        if (!immediate) {
            return new Promise((resolve) => {
                onClose = resolve;
            });
        }
    };
}

//
// X2Many
//

class X2ManyFieldDialog extends owl.Component {
    setup() {
        super.setup();
        this.archInfo = this.props.archInfo;
        this.record = this.props.record;
        this.title = this.props.title;

        useBus(this.record.model, "update", () => this.render(true));

        this.modalRef = useChildRef();

        const reload = () => this.record.load();
        useViewButtons(this.props.record.model, this.modalRef, { reload }); // maybe pass the model directly in props

        if (this.archInfo.xmlDoc.querySelector("footer")) {
            this.footerArchInfo = Object.assign({}, this.archInfo);
            this.footerArchInfo.xmlDoc = createElement("t");
            this.footerArchInfo.xmlDoc.append(
                ...[...this.archInfo.xmlDoc.querySelectorAll("footer")]
            );
            this.footerArchInfo.arch = this.footerArchInfo.xmlDoc.outerHTML;
            [...this.archInfo.xmlDoc.querySelectorAll("footer")].forEach((x) => x.remove());
            this.archInfo.arch = this.archInfo.xmlDoc.outerHTML;
        }
    }

    disableButtons() {
        const btns = this.modalRef.el.querySelectorAll(".modal-footer button");
        for (const btn of btns) {
            btn.setAttribute("disabled", "1");
        }
        return btns;
    }

    discard() {
        if (this.record.isInEdition) {
            this.record.discard();
        }
        this.props.close();
    }

    enableButtons(btns) {
        for (const btn of btns) {
            btn.removeAttribute("disabled");
        }
    }

    async save({ saveAndNew }) {
        if (this.record.checkValidity()) {
            this.record = await this.props.save(this.record, { saveAndNew });
        } else {
            return false;
        }
        if (!saveAndNew) {
            this.props.close();
        }
        return true;
    }

    async remove() {
        await this.props.delete();
        this.props.close();
    }

    async saveAndNew() {
        const disabledButtons = this.disableButtons();
        const saved = await this.save({ saveAndNew: true });
        if (saved) {
            this.enableButtons(disabledButtons);
            if (this.title) {
                this.title = this.title.replace(this.env._t("Open:"), this.env._t("New:"));
            }
            this.render(true);
        }
    }
}
X2ManyFieldDialog.components = { Dialog, FormRenderer, ViewButton };
X2ManyFieldDialog.props = {
    archInfo: Object,
    close: Function,
    record: Object,
    save: Function,
    title: String,
    delete: { optional: true },
};
X2ManyFieldDialog.template = "web.X2ManyFieldDialog";

async function getFormViewInfo({ list, activeField, viewService, userService, env }) {
    let formViewInfo = activeField.views.form;
    const comodel = list.resModel;
    if (!formViewInfo) {
        const { fields, relatedModels, views } = await viewService.loadViews({
            context: {},
            resModel: comodel,
            views: [[false, "form"]],
        });
        const archInfo = new FormArchParser().parse(views.form.arch, relatedModels, comodel);
        formViewInfo = { ...archInfo, fields }; // should be good to memorize this on activeField
    }

    await loadSubViews(
        formViewInfo.activeFields,
        formViewInfo.fields,
        {}, // context
        comodel,
        viewService,
        userService,
        env.isSmall
    );

    return formViewInfo;
}

export function useActiveActions({
    subViewActiveActions,
    crudOptions = {},
    isMany2Many,
    getEvalParams,
}) {
    const makeEvalAction = (actionName, subViewActiveActions, defaultBool = true) => {
        let evalFn;
        if (crudOptions[actionName] !== undefined) {
            const action = crudOptions[actionName];
            evalFn = (evalContext) => evalDomain(action, evalContext);
        } else {
            evalFn = () => defaultBool;
        }

        if (subViewActiveActions) {
            const viewActiveAction = subViewActiveActions[actionName];
            return (evalContext) => viewActiveAction && evalFn(evalContext);
        }
        return evalFn;
    };

    const evalCreate = makeEvalAction("create", subViewActiveActions);
    const evalDelete = makeEvalAction("delete", subViewActiveActions);
    const evalLink = makeEvalAction("link");
    const evalUnlink = makeEvalAction("unlink");
    const evalWrite = makeEvalAction("write", null, false);

    function compute({ evalContext, readonly = true }) {
        // activeActions computed by getActiveActions is of the form
        // interface ActiveActions {
        //     edit: Boolean;
        //     create: Boolean;
        //     delete: Boolean;
        //     duplicate: Boolean;
        // }

        // options set on field is of the form
        // interface Options {
        //     create: Boolean;
        //     delete: Boolean;
        //     link: Boolean;
        //     unlink: Boolean;
        // }

        // We need to take care of tags "control" and "create" to set create stuff
        const canCreate = !readonly && evalCreate(evalContext);
        const canDelete = !readonly && evalDelete(evalContext);

        const canLink = !readonly && evalLink(evalContext);
        const canUnlink = !readonly && evalUnlink(evalContext);

        const result = { canCreate, canDelete };

        if (isMany2Many) {
            Object.assign(result, { canLink, canUnlink, canWrite: evalWrite(evalContext) });
        }

        if ((isMany2Many && canUnlink) || (!isMany2Many && canDelete)) {
            result.onDelete = crudOptions.onDelete;
        }
        return result;
    }

    let activeActions = null;

    owl.onWillRender(() => {
        activeActions = compute(getEvalParams());
    });

    return new Proxy(
        {},
        {
            get(target, k) {
                return activeActions[k];
            },
            has(target, k) {
                return k in activeActions;
            },
        }
    );
}

export function useAddInlineRecord({ position, addNew }) {
    let creatingRecord = false;

    async function addInlineRecord({ context }) {
        if (!creatingRecord) {
            creatingRecord = true;
            try {
                await addNew({ context, mode: "edit", position });
            } finally {
                creatingRecord = false;
            }
        }
    }
    return addInlineRecord;
}

export function useOpenX2ManyRecord({
    resModel,
    activeField,
    activeActions,
    getList,
    updateRecord,
    saveRecord,
}) {
    const viewService = useService("view");
    const userService = useService("user");
    const env = owl.useEnv();

    const addDialog = useOwnedDialogs();
    const viewMode = activeField.viewMode;

    async function openRecord({ record, mode, context, title }) {
        if (!title) {
            title = record ? env._t("Open: %s") : env._t("Create %s");
            title = sprintf(title, activeField.string);
        }
        const list = getList();
        const model = list.model;
        const form = await getFormViewInfo({ list, activeField, viewService, userService, env });

        let deleteRecord;
        const isDuplicate = !!record;

        if (record) {
            const _record = record;
            record = await model.duplicateDatapoint(record, {
                mode,
                viewMode: "form",
                fields: { ...form.fields },
                views: { form },
            });
            const { canDelete, onDelete } = activeActions;
            deleteRecord = viewMode === "kanban" && canDelete ? () => onDelete(_record) : null;
        } else {
            const recordParams = {
                context: makeContext([list.context, context]),
                resModel: resModel,
                activeFields: form.activeFields,
                fields: { ...form.fields },
                views: { form },
                mode: "edit",
                viewType: "form",
            };
            record = await model.addNewRecord(list, recordParams);
        }

        addDialog(X2ManyFieldDialog, {
            archInfo: form,
            record,
            save: async (rec, { saveAndNew }) => {
                if (isDuplicate && rec.id === record.id) {
                    await updateRecord(rec);
                } else {
                    await saveRecord(rec);
                }
                if (saveAndNew) {
                    return model.addNewRecord(list, {
                        context: list.context,
                        resModel: resModel,
                        activeFields: form.activeFields,
                        fields: { ...form.fields },
                        views: { form },
                        mode: "edit",
                        viewType: "form",
                    });
                }
            },
            title,
            delete: deleteRecord,
        });
    }
    return openRecord;
}

export function useX2ManyCrud(getList, isMany2Many) {
    let saveRecord;
    if (isMany2Many) {
        saveRecord = (object) => {
            const list = getList();
            const currentIds = list.currentIds;
            let resIds;
            if (Array.isArray(object)) {
                resIds = [...currentIds, ...object];
            } else if (object.resId) {
                resIds = [...currentIds, object.resId];
            } else {
                return list.add(object, { isM2M: isMany2Many });
            }
            return list.replaceWith(resIds);
        };
    } else {
        saveRecord = (record) => {
            return getList().add(record);
        };
    }

    const updateRecord = (record) => {
        const list = getList();
        return list.model.updateRecord(list, record, { isM2M: isMany2Many });
    };

    const operation = isMany2Many ? "FORGET" : "DELETE";
    const removeRecord = (record) => {
        const list = getList();
        return list.delete(record.id, operation);
    };

    return {
        saveRecord,
        updateRecord,
        removeRecord,
    };
}
