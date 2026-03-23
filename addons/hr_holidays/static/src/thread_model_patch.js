import { Thread } from "@mail/core/common/thread_model";
import { patch } from "@web/core/utils/patch";

patch(Thread.prototype, {
    get allowOutOfOfficeBanner() {
        return (
            this.model === "discuss.channel" &&
            Boolean(this.correspondent?.persona.outOfOfficeDateEndText)
        );
    },
});
