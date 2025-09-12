import { ChatWindow } from "@mail/core/common/chat_window";
import { Component, useState, useSubEnv } from "@odoo/owl";
import { Notebook } from "@web/core/notebook/notebook";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

import { FormRenderer } from "@web/views/form/form_renderer";
import { formView } from "@web/views/form/form_view";

export class PreviewChatWindow extends ChatWindow {
    static template = "im_livechat.ChatWindowPreview";

    setup() {
        super.setup();
        this.state = useState(this.env.record);
    }
    get attClass() {
        const result = super.attClass;
        result["fixed-bottom"] = false;
        return result;
    }

    get options() {
        void this.state._changes.header_background_color;
        void this.state.data.header_background_color;
        return {
            title_color: this.state._changes.title_color ?? this.state.data.title_color,
            header_background_color:
                this.state._changes.header_background_color ??
                this.state.data.header_background_color,
        };
    }
}

export class LivechatPreview extends Component {
    static template = "im_livechat.LivechatDesign";
    static components = { PreviewChatWindow };

    setup() {
        this.store = useService("mail.store");
        const { channel_id, store_data } = this.env.record.data.preview_channel_data;
        this.store.insert(store_data);
        this.chatWindow = this.store.ChatWindow.insert({
            thread: this.store.Thread.get({ id: channel_id, model: "discuss.channel" }),
        });
    }
}

export class LivechatChatWindowNotebook extends Notebook {
    static components = { ...Notebook.components, LivechatPreview };
    static template = "im_livechat.ChatWindowPreviewNotebook";

    get isDesignPage() {
        return this.pages.find((e) => e[0] === this.state.currentPage)[1]?.name === "design";
    }
}

export class LivechatChatWindowFormRenderer extends FormRenderer {
    static components = { ...FormRenderer.components, Notebook: LivechatChatWindowNotebook };

    setup() {
        super.setup();
        useSubEnv({ record: this.props.record });
    }
}

export const LivechatChatWindowFormView = {
    ...formView,
    Renderer: LivechatChatWindowFormRenderer,
};

registry.category("views").add("livechat_chat_window_form", LivechatChatWindowFormView);
