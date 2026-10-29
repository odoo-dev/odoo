import { attClassObjectToString } from "@mail/utils/common/format";
import { useAncestors } from "@mail/core/common/ancestor_plugin";
import { Component, signal, t, usePlugin, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { ResizablePanel } from "@web/core/resizable_panel/resizable_panel";
import { UIPlugin } from "@web/core/ui/ui_plugin";
import { useBackButton, useService } from "@web/core/utils/hooks";

/** @see import("@mail/core/common/action").PanelCloseOptions */
const panelCloseOptionsSchema = t.object({ closeAll: t.boolean().optional() });

export class ActionPanel extends Component {
    static template = "mail.ActionPanel";
    static components = { ResizablePanel };
    setup() {
        super.setup();
        this.ancestors = useAncestors({
            inActionPanel: {
                /** @param {import("@mail/core/common/action").PanelCloseOptions} [options] */
                close: (options) => this.props.close?.(options),
            },
            inDiscussCallTheme: false,
        });
        this.props = useProps({
            close: t.function([panelCloseOptionsSchema.optional()]).optional(),
            contentPadding: t.boolean().optional(true),
            icon: t.string().optional(),
            iconClass: t.string().optional(),
            initialWidth: t.number().optional(),
            minWidth: t.number().optional(),
            resizable: t.boolean().optional(true),
            title: t.string().optional(),
        });
        /** Content element, either owned by the parent (`contentRef` prop) or local. */
        this.contentRef = useProps.static(
            "contentRef",
            t.signal(t.instanceOf(HTMLDivElement)).optional(() => signal.ref())
        );
        this.store = useService("mail.store");
        this.ui = usePlugin(UIPlugin);
        useBackButton(
            () => this.props.close(),
            () => this.props.close
        );
    }

    get backButtonTitle() {
        return this.ancestors.inMeetingView?.hasPreviousActionPanel
            ? _t("Back to previous panel")
            : _t("Close panel");
    }

    get classNames() {
        return attClassObjectToString({
<<<<<<< c84fbd6b53c64b9b2aaa6168c47a1ca4378ab63c
            "o-mail-ActionPanel rounded-4 overflow-auto o-scrollbar-thin d-flex flex-column flex-shrink-0 position-relative py-2 pt-0 h-100 bg-inherit": true,
            "o-mail-ActionPanel-chatter": this.ancestors.inChatter,
            "o-chatWindow": this.ancestors.inChatWindow,
            "px-2": this.ancestors.inDiscussApp || this.ancestors.inChatWindow,
||||||| ff333da20f9a42f70b52d1af97a5d08ac50c3cc5
            "o-mail-ActionPanel rounded-4 overflow-auto o-scrollbar-thin d-flex flex-column flex-shrink-0 position-relative py-2 pt-0 h-100 bg-inherit": true,
            "o-mail-ActionPanel-chatter": this.env.inChatter,
            "o-chatWindow": this.env.inChatWindow,
            "px-2": this.env.inDiscussApp || this.env.inChatWindow,
=======
            "o-mail-ActionPanel rounded-4 overflow-auto o-scrollbar-thin d-flex flex-column position-relative py-2 pt-0 h-100 bg-inherit": true,
            "flex-shrink-0": !this.env.inDialog,
            "o-mail-ActionPanel-chatter": this.env.inChatter,
            "o-chatWindow": this.env.inChatWindow,
            "px-2": this.env.inDiscussApp || this.env.inChatWindow,
>>>>>>> b78734abd7d4c13afbe52137166792f85b9c793c
            rounded: !this.props.resizable,
        });
    }

    get minWidth() {
        return this.props.minWidth;
    }

    get initialWidth() {
        return this.ancestors.inDiscussContent?.panelWidth() ?? this.props.initialWidth;
    }

    /** @param {number} width */
    onResize(width) {
        this.ancestors.inDiscussContent?.setPanelWidth(width);
    }
}
