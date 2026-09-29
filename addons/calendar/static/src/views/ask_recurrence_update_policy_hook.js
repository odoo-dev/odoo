import { usePlugin } from "@odoo/owl";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { AskRecurrenceUpdatePolicyDialog } from "@calendar/views/ask_recurrence_update_policy_dialog";

export function askRecurrenceUpdatePolicy(dialogService) {
    return new Promise((resolve) => {
        dialogService.add(AskRecurrenceUpdatePolicyDialog, {
            confirm: resolve,
        }, {
            onClose: resolve.bind(null, false),
        });
    });
}

export function useAskRecurrenceUpdatePolicy() {
    const dialogService = usePlugin(DialogPlugin);
    return askRecurrenceUpdatePolicy.bind(null, dialogService);
}
