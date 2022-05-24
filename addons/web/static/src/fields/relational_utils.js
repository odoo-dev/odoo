/** @odoo-module */

import { useOwnedDialogs, useService } from "@web/core/utils/hooks";
import { SelectCreateDialog } from "@web/views/view_dialogs/select_create_dialog";
import { FormViewDialog } from "@web/views/view_dialogs/form_view_dialog";
import { sprintf } from "@web/core/utils/strings";

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

    return async function openDialog({ resId = false, title, context }) {
        let viewId;
        if (resId !== false) {
            viewId = await orm.call(resModel, "get_formview_id", [[resId]], {
                context,
            });
        }

        let onClose;
        if (!title) {
            title = resId ? env._t("Open") : env._t("Create");
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

        return new Promise((resolve) => {
            onClose = resolve;
        });
    };
}
