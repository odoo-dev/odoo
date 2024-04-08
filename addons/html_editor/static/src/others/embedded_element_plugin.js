import { Plugin } from "@html_editor/plugin";
import { App } from "@odoo/owl";

export class EmbeddedElementPlugin extends Plugin {
    static name = "embedded_elements";

    setup() {
        this.apps = [];
        for (const embedding of this.config.embeddedElements) {
            const targets = this.editable.querySelectorAll(`[data-embedded="${embedding.name}"]`);
            for (const target of targets) {
                this.mountApp(target, embedding.Component);
            }
        }
    }

    mountApp(elem, C) {
        elem.setAttribute("contenteditable", "false");
        const app = new App(C);
        app.mount(elem);
        this.apps.push(app);
    }
    destroy() {
        super.destroy();
        for (const app of this.apps) {
            app.destroy();
        }
    }
}
