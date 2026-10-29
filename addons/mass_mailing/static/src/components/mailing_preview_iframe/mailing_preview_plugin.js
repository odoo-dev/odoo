import { computed, Plugin, signal, usePlugin } from "@odoo/owl";
import { UIPlugin } from "@web/core/ui/ui_plugin";

/**
 * Display mode of the mailing preview, shared by the preview and the
 * desktop/mobile toggle.
 */
export class MailingPreviewPlugin extends Plugin {
    ui = usePlugin(UIPlugin);
    /** Desktop/mobile choice of the toggle, only offered on large screens. */
    mobileModeSelected = signal(false);
    isMobileMode = computed(() => this.ui.isSmall() || this.mobileModeSelected());
}
