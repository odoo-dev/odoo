import { ActionPanel } from "@mail/discuss/core/common/action_panel";
import { Component } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class LivechatChannelInfoList extends Component {
    static components = { ActionPanel };
    static template = "im_livechat.channelInfoList";
    static props = ["thread"];

    setup() {
        super.setup();
        this.orm = useService("orm");
    }

    onBlurNote() {
        this.orm.write("discuss.channel", [this.props.thread.id], {
            livechat_note: this.props.thread.livechatNoteText,
        });
    }
}
