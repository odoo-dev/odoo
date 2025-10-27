import { Thread } from "@mail/core/common/thread";
import { patch } from "@web/core/utils/patch";

patch(Thread.prototype, {
    get showStartMessage() {
        if (this.store.fullscreenChannel?.eq(this.props.thread.channel)) {
            return false;
        }
        return super.showStartMessage;
    },
});
