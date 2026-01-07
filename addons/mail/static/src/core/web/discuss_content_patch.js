import { DiscussContent } from "@mail/core/public_web/discuss_content";
import { patch } from "@web/core/utils/patch";

patch(DiscussContent.prototype, {
    async onClickManageFolders() {
        const action = await this.store.env.services.orm.call(
            "mail.folder",
            "action_show_folders",
            [this.id]
        );
        return new Promise((resolve) =>
            this.store.env.services.action.doAction(action, { onClose: resolve })
        );
    },
});
