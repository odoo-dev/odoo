import { FollowerList } from "@mail/core/web/follower_list";
import { usePlugin } from "@odoo/owl";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { _t } from "@web/core/l10n/translation";

import { patch } from "@web/core/utils/patch";

const followerListPatch = {
    setup() {
        super.setup();
        this.dialogService = usePlugin(DialogPlugin);
    },
    /**
     * @param {MouseEvent} ev
     * @param {import("models").Follower} follower
     */
    async onClickRemove(ev, follower) {
        if (follower.partner_id.in(follower.thread.collaborator_ids)) {
            this.dialogService.add(ConfirmationDialog, {
                title: _t("Remove Collaborator"),
                body: _t(
                    "This follower is currently a project collaborator. Removing them will revoke their portal access to the project. Are you sure you want to proceed?"
                ),
                confirmLabel: _t("Remove Collaborator"),
                confirm: () => super.onClickRemove(ev, follower),
                cancel: () => {},
            });
        } else {
            super.onClickRemove(ev, follower);
        }
    },
};
patch(FollowerList.prototype, followerListPatch);
