import { Component, proxy } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";

export class SlideUnsubscribeDialog extends Component {
    static template = "website_slides.SlideUnsubscribeDialog";
    static components = { Dialog };
    static props = {
        channelId: Number,
        visibility: String,
        enroll: { type: String, optional: true },
        close: Function,
    };

    setup() {
        this.title = _t("Leave the course");
        this.state = proxy({ buttonDisabled: false });
    }

    async onConfirm() {
        if (this.state.buttonDisabled) {
            return;
        }
        this.state.buttonDisabled = true;
        await rpc("/slides/channel/leave", { channel_id: this.props.channelId });
        if (this.props.visibility === "public" || this.props.visibility === "connected") {
            window.location.reload();
        } else {
            window.location.href = "/slides";
        }
    }
}
