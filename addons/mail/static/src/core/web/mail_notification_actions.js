import { registry } from "@web/core/registry";
import { IndexedDB } from "@web/core/utils/indexed_db";

registry.category("actions").add("action_send_mail_callback", async (env, action) => {
    const store = env.services["mail.store"];
    const discuss = store.discuss;
    const db = new IndexedDB("mail");
    const { res_model, res_id, record_name } = action.params;
    const composerLocalId = store["mail.thread"].get({ model: res_model, id: res_id })?.composer
        ?.localId;

    if (discuss.isActive && discuss.thread?.model === "mail.box") {
        store.notifySendFromMailbox(record_name);
    }
    if (composerLocalId) {
        await db.delete("composer", composerLocalId);
    }
    await env.services.action.doAction({ type: "ir.actions.act_window_close" });
});
