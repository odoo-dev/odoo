import { Discuss } from "@mail/core/public_web/discuss";
import { patch } from "@web/core/utils/patch";

patch(Discuss.prototype, {
    actionPanelAutoOpenFn() {
        const infoAction = this.threadActions.actions.find((a) => a.id === "info");
        if (infoAction && this.threadActions.activeAction !== infoAction) {
            infoAction.open();
            return;
        }
        super.actionPanelAutoOpenFn();
    },
});
