import { usePlugin } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

registry.category("actions").add("action_send_mail_callback", async () => {
    const action = usePlugin(ActionPlugin);
    await action.doAction({ type: "ir.actions.act_window_close" });
});
