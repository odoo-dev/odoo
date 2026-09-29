import { usePlugin } from "@odoo/owl";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { registry } from "@web/core/registry";
import { KEProxyDialog } from "./ke_proxy_dialog";

export function KESendInvoiceClientAction(env, action) {
    const dialog = usePlugin(DialogPlugin);
    return new Promise((resolve) => {
        dialog.add(
            KEProxyDialog,
            { invoices: action.params },
            {
                onClose: () => {
                    resolve({ type: "ir.actions.act_window_close" });
                },
            }
        );
    });
}

registry.category("actions").add("l10n_ke_post_send", KESendInvoiceClientAction);
