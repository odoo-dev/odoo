/** @odoo-module */

import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";

export class ShortCutPlugin extends Plugin {
    static name = "shortcut";

    start() {
        for (const [hotkey, shortcut] of this.registry.category("shortcuts").getEntries()) {
            this.addShortcut(hotkey, () => {
                this.dispatch(shortcut.command);
            });
        }
    }

    addShortcut(hotkey, action) {
        this.services.hotkey.add(hotkey, action, {
            area: () => this.editable,
            bypassEditableProtection: true,
        });
    }
}

registry.category("phoenix_plugins").add(ShortCutPlugin.name, ShortCutPlugin);
