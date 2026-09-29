import { usePlugin } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";
import { QuickVideoSettings } from "../common/quick_video_settings";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

patch(QuickVideoSettings.prototype, {
    setup() {
        super.setup();
        this.actionService = usePlugin(ActionPlugin);
    },
    onClickVideoSettings() {
        this.actionService.doAction({
            context: {
                dialog_size: "medium",
                footer: false,
                initialTab: "video",
            },
            name: _t("Voice & Video Settings"),
            tag: "mail.discuss_call_settings_action",
            target: "new",
            type: "ir.actions.client",
        });
    },
});
