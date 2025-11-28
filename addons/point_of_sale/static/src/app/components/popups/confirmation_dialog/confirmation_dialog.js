import { AlertDialog, ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { SyncPopup } from "@point_of_sale/app/components/popups/sync_popup/sync_popup";

patch(ConfirmationDialog.prototype, {
    async _cancel() {
        this.props.getPayload && this.props.getPayload(false);
        return this.execButton(this.props.cancel);
    },
    async _confirm() {
        this.props.getPayload && this.props.getPayload(true);
        return this.execButton(this.props.confirm);
    },
    async _dismiss() {
        this.props.getPayload && this.props.getPayload(false);
        return this.execButton(this.props.dismiss || this.props.cancel);
    },
    async _reloadData() {
        this.props.close();
        this.env.services.dialog.add(SyncPopup, {
            title: _t("Reload Data"),
            confirm: (fullReload) => this.env.services.pos?.reloadData(fullReload),
        });
    },
});

ConfirmationDialog.props = {
    ...ConfirmationDialog.props,
    getPayload: { type: Function, optional: true },
    showReloadButton: { type: Boolean, optional: true },
};

AlertDialog.props = {
    ...AlertDialog.props,
    getPayload: { type: Function, optional: true },
    showReloadButton: { type: Boolean, optional: true },
};

patch(AlertDialog.prototype, {
    setup() {
        super.setup();
        if (this.props.showReloadButton === undefined) {
            this.props.showReloadButton = true;
        }
    },
});
