import { usePlugin } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { QuickVoiceSettings } from "@mail/discuss/call/common/quick_voice_settings";
import { patch } from "@web/core/utils/patch";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

patch(QuickVoiceSettings.prototype, {
    setup() {
        super.setup();
        this.actionService = usePlugin(ActionPlugin);
    },
    onClickVoiceSettings() {
        this.actionService.doAction({
            context: {
                dialog_size: "medium",
                footer: false,
            },
            name: _t("Voice & Video Settings"),
            tag: "mail.discuss_call_settings_action",
            target: "new",
            type: "ir.actions.client",
        });
    },
});
