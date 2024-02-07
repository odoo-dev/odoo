import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";

export class ZwsPlugin extends Plugin {
    static name = "zws";

    handleCommand(command, payload) {
        switch (command) {
            case "CLEAN":
                this.clean(payload);
                break;
        }
    }

    clean(element) {
        for (const el of element.querySelectorAll("[data-oe-zws-empty-inline]")) {
            el.remove();
        }
    }
}

registry.category("phoenix_plugins").add(ZwsPlugin.name, ZwsPlugin);
