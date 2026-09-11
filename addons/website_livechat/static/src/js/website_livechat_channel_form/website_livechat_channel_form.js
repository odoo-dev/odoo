import { registry } from "@web/core/registry";
import { formView } from "@web/views/form/form_view";
import { FormController } from "@web/views/form/form_controller";
import { onMounted, onWillUnmount } from "@odoo/owl";

const NOTIFICATION_TYPE = "im_livechat.channel/theme_colors_synced";

/**
 * Keeps the channel's color fields fresh when the server auto-resyncs them
 * from the website's theme (e.g. after a color palette change), regardless
 * of which tab of the form is currently open.
 */
export class WebsiteLivechatChannelFormController extends FormController {
    setup() {
        super.setup();
        this.busService = this.env.services.bus_service;
        this._onThemeColorsSynced = this._onThemeColorsSynced.bind(this);
        onMounted(() => {
            if (this.model.root.resId) {
                this.channel = `im_livechat.channel_${this.model.root.resId}`;
                this.busService.addChannel(this.channel);
                this.busService.subscribe(NOTIFICATION_TYPE, this._onThemeColorsSynced);
            }
        });
        onWillUnmount(() => {
            if (this.channel) {
                this.busService.unsubscribe(NOTIFICATION_TYPE, this._onThemeColorsSynced);
                this.busService.deleteChannel(this.channel);
            }
        });
    }

    _onThemeColorsSynced(payload) {
        const { id, ...colors } = payload ?? {};
        if (id === this.model.root.resId) {
            this.model.root.data = { ...this.model.root.data, ...colors };
        }
    }
}

registry.category("views").add("website_livechat_channel_form", {
    ...formView,
    Controller: WebsiteLivechatChannelFormController,
});
