import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";
import { Component, usePlugin } from "@odoo/owl";
import { MailingPreviewPlugin } from "../mailing_preview_iframe/mailing_preview_plugin";

export class MailingPreviewDisplayModeToggle extends Component {
    static template = "mass_mailing.MailingPreviewModeToggle";
    static props = {
        ...standardWidgetProps,
    };

    setup() {
        this.ui = useService("ui");
        this.mailingPreviewPlugin = usePlugin(MailingPreviewPlugin);
    }

    onTogglePreviewMode(isMobileMode) {
        this.mailingPreviewPlugin.mobileModeSelected.set(isMobileMode);
    }
}

export const mailingPreviewDisplayModeToggle = {
    component: MailingPreviewDisplayModeToggle,
};

registry
    .category("view_widgets")
    .add("mailing_preview_display_mode_toggle", mailingPreviewDisplayModeToggle);
