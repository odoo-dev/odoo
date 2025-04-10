import { patch } from "@web/core/utils/patch";
import { ChatWindow } from "./core/common/chat_window_model";

patch(ChatWindow.prototype, {
    get attClass() {
        return {
            ...super.attClass,
            "o-isAiComposer": this.thread?.channel_type === "ai_composer",
        };
    },
});
