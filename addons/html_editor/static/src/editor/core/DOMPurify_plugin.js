import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";

export class DOMPurifyPlugin extends Plugin {
    static name = "dompurify";
    static shared = ["purify"];
    setup() {
        if (!window.DOMPurify) {
            throw new Error("DOMPurify is not available");
        }
        this.DOMPurify = DOMPurify(this.document.defaultView);
    }
    purify(...args) {
        return this.DOMPurify.sanitize(...args);
    }
}

registry.category("phoenix_plugins").add(DOMPurifyPlugin.name, DOMPurifyPlugin);
