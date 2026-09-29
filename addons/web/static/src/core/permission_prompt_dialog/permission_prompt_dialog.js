import { Component, t, usePlugin, useProps } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { UIPlugin } from "@web/core/ui/ui_plugin";

export class PermissionPromptDialog extends Component {
    static components = { Dialog };
    static template = "web.PermissionPromptDialog";
    props = useProps({
        title: t.any().optional(),
        contentClass: t.any().optional(),
        close: t.any().optional(),
        slots: t.any().optional(),
        size: t.any().optional(),
        illustrationPosition: t.any().optional(),
    });

    setup() {
        this.ui = usePlugin(UIPlugin);
    }
}
