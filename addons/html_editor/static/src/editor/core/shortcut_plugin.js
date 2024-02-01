import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";

export class ShortCutPlugin extends Plugin {
    static name = "shortcut";

    setup() {
        for (const shortcut of this.resources["shortcuts"]) {
            this.addShortcut(shortcut.hotkey, () => {
                this.dispatch(shortcut.command);
            });
        }
    }

    addShortcut(hotkey, action) {
        this.services.hotkey.add(hotkey, action, {
            area: () => this.editable,
            bypassEditableProtection: true,
            allowRepeat: true,
        });
    }
}

registry.category("phoenix_plugins").add(ShortCutPlugin.name, ShortCutPlugin);
