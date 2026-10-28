import { computed, Plugin, signal, types as t, useConfig } from "@odoo/owl";

/**
 * Display mode of the mailing preview, shared by the preview and the
 * desktop/mobile toggle.
 *
 * Config:
 * - `ui`: the ui service, to follow the screen size.
 */
export class MailingPreviewPlugin extends Plugin {
    ui = useConfig("ui", t.object());
    /** Desktop/mobile choice of the toggle, only offered on large screens. */
    mobileModeSelected = signal(false);
    isMobileMode = computed(() => this.ui.isSmall || this.mobileModeSelected());
}
