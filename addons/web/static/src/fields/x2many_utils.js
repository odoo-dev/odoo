/** @odoo-module */
import { makeContext } from "@web/core/context";
import { useOwnedDialogs, useService } from "@web/core/utils/hooks";
import { SelectCreateDialog } from "@web/views/view_dialogs/select_create_dialog";

import { FormArchParser } from "@web/views/form/form_arch_parser";
import { loadSubViews } from "@web/views/form/form_controller";
import { sprintf } from "@web/core/utils/strings";
import { evalDomain } from "@web/views/basic_relational_model";
import { useBus, useChildRef } from "../core/utils/hooks";
import { useViewButtons } from "../views/view_button/hook";
import { createElement } from "../core/utils/xml";
import { Dialog } from "../core/dialog/dialog";
import { FormRenderer } from "../views/form/form_renderer";
import { ViewButton } from "../views/view_button/view_button";

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

export function useActiveActions({ subViewActiveActions, crudOptions, isMany2Many, x2ManyCrud }) {
    const makeEvalAction = (actionName, subViewActiveActions, defaultBool = true) => {
        let evalFn;
        if (actionName in crudOptions) {
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

    function compute(evalContext, mode) {
        const isReadonly = mode === "readonly";
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
        const canCreate = !isReadonly && evalCreate(evalContext);
        const canDelete = !isReadonly && evalDelete(evalContext);

        const canLink = !isReadonly && evalLink(evalContext);
        const canUnlink = !isReadonly && evalUnlink(evalContext);

        const result = { canCreate, canDelete };

        if (isMany2Many) {
            Object.assign(result, { canLink, canUnlink, canWrite: evalWrite(evalContext) });
        }

        if ((isMany2Many && canUnlink) || (!isMany2Many && canDelete)) {
            result.onDelete = x2ManyCrud.remove;
        }
        return result;
    }
    return compute;
}

export function useX2ManyCrud(getList, isMany2Many) {
    const operation = isMany2Many ? "FORGET" : "DELETE";
    const model = getList().model;
    async function remove(record) {
        await getList().delete(record.id, operation);
    }

    async function saveToList(recordOrResIds) {
        await getList().add(recordOrResIds, { isM2M: isMany2Many });
    }

    async function newRecordInList() {
        return await getList().addNew(...arguments);
    }

    function newRecord() {
        return model.addNewRecord(getList(), ...arguments);
    }

    async function update(record) {
        await model.updateRecord(getList(), record, { isM2M: isMany2Many });
    }

    return {
        remove,
        saveToList,
        update,
        newRecordInList,
        newRecord,
        get list() {
            return getList();
        },
    };
}

export function useX2ManyInteractions({ activeField, x2ManyCrud, editable = false }) {
    const env = owl.useEnv();

    const viewMode = activeField.viewMode;

    const addDialog = useOwnedDialogs();

    async function openRecord(record, mode, activeActions) {
        const list = x2ManyCrud.list;
        const form = await getFormViewInfo({ list, activeField, viewService, userService, env });
        const newRecord = await list.model.duplicateDatapoint(record, {
            mode,
            viewMode: "form",
            fields: { ...form.fields },
            views: { form },
        });
        const { canDelete, onDelete } = activeActions;
        addDialog(X2ManyFieldDialog, {
            archInfo: form,
            record: newRecord,
            save: async (record, { saveAndNew }) => {
                if (record.id === newRecord.id) {
                    await x2ManyCrud.update(record);
                } else {
                    await x2ManyCrud.saveToList(record);
                }
                if (saveAndNew) {
                    return x2ManyCrud.newRecord({
                        context: list.context,
                        resModel: list.resModel,
                        activeFields: form.activeFields,
                        fields: { ...form.fields },
                        views: { form },
                        mode: "edit",
                        viewType: "form",
                    });
                }
            },
            title: sprintf(env._t("Open: %s"), activeField.string),
            delete: viewMode === "kanban" && canDelete ? () => onDelete(record) : null,
        });
    }

    function selectCreate({ domain, context, activeActions = {} }) {
        const list = x2ManyCrud.list;
        domain = [...domain, "!", ["id", "in", list.currentIds]];
        addDialog(SelectCreateDialog, {
            title: env._t("Select records"),
            noCreate: !activeActions.canCreate,
            multiSelect: activeActions.canLink, // LPE Fixme
            resModel: list.resModel,
            context,
            domain,
            onSelected: (resIds) => {
                return x2ManyCrud.saveToList(resIds);
            },
            onCreateEdit: () => addRecord({ context }),
        });
    }

    const viewService = useService("view");
    const userService = useService("user");

    let creatingRecord = false;

    let addRecord;
    if (editable) {
        addRecord = async ({ context }) => {
            if (!creatingRecord) {
                creatingRecord = true;
                try {
                    await x2ManyCrud.newRecordInList({ context, mode: "edit", position: editable });
                } finally {
                    creatingRecord = false;
                }
            }
        };
    } else {
        addRecord = async ({ context }) => {
            const list = x2ManyCrud.list;
            const form = await getFormViewInfo({
                list,
                activeField,
                viewService,
                userService,
                env,
            });
            const recordParams = {
                context: makeContext([list.context, context]),
                resModel: list.resModel,
                activeFields: form.activeFields,
                fields: { ...form.fields },
                views: { form },
                mode: "edit",
                viewType: "form",
            };
            const record = await x2ManyCrud.newRecord(recordParams);
            addDialog(X2ManyFieldDialog, {
                archInfo: form,
                record,
                save: async (record, { saveAndNew }) => {
                    await x2ManyCrud.saveToList(record);
                    if (saveAndNew) {
                        return x2ManyCrud.newRecord(recordParams);
                    }
                },
                title: sprintf(env._t("Open: %s"), activeField.string),
            });
        };
    }

    return {
        openRecord,
        selectCreate,
        addRecord,
    };
}
