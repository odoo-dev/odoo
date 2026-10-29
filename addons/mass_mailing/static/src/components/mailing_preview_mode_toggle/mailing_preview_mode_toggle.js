import { Component, usePlugin, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { UIPlugin } from "@web/core/ui/ui_plugin";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";
import { MailingPreviewPlugin } from "../mailing_preview_iframe/mailing_preview_plugin";

export class MailingPreviewDisplayModeToggle extends Component {
    static template = "mass_mailing.MailingPreviewModeToggle";

    props = useProps(standardWidgetProps);

    ui = usePlugin(UIPlugin);

    mailingPreviewPlugin = usePlugin(MailingPreviewPlugin);

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
