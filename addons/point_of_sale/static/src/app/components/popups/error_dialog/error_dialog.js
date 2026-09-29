import { usePlugin } from "@odoo/owl";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { isDisplayStandalone } from "@web/core/browser/feature_detection";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { ErrorDialog } from "@web/core/errors/error_dialogs";
import { resetLocalData } from "../../loader/critical_pos_error/reset_local_data";

patch(ErrorDialog.prototype, {
    setup() {
        super.setup();
        this.isDisplayStandalone = isDisplayStandalone();
        this.dialog = usePlugin(DialogPlugin);
    },

    reloadData() {
        this.props.close();
        this.dialog.add(ConfirmationDialog, {
            title: _t("Reload Data"),
            body: _t("This action will delete all unsaved orders and other locally stored data"),
            confirm: () => resetLocalData(),
            confirmLabel: _t("Confirm"),
        });
    },
});
