import { threadActionsRegistry } from "@mail/core/common/thread_actions";
import { patch } from "@web/core/utils/patch";
import "@mail/discuss/core/common/thread_actions";
import "@mail/discuss/call/common/thread_actions";

patch(threadActionsRegistry.get("invite-people"), {
    condition(component) {
        if (component.thread?.channel_type === "livechat") {
            return super.condition(component) && !component.thread.livechat_end_dt;
        }
        return super.condition(component);
    },
});

patch(threadActionsRegistry.get("notification-settings"), {
    condition(component) {
        if (component.thread?.channel_type === "livechat") {
            return super.condition(component) && !component.thread.livechat_end_dt;
        }
        return super.condition(component);
    },
});

patch(threadActionsRegistry.get("camera-call"), {
    condition(component) {
        if (component.thread?.channel_type === "livechat") {
            return super.condition(component) && !component.thread.livechat_end_dt;
        }
        return super.condition(component);
    },
});

patch(threadActionsRegistry.get("call"), {
    condition(component) {
        if (component.thread?.channel_type === "livechat") {
            return super.condition(component) && !component.thread.livechat_end_dt;
        }
        return super.condition(component);
    },
});
