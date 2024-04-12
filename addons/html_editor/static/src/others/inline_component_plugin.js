import { Plugin } from "@html_editor/plugin";
import { App } from "@odoo/owl";

/**
 * This plugin is responsible with providing the API to manipulate/insert
 * sub components in an editor.
 */
export class InlineComponentPlugin extends Plugin {
    static name = "inline_components";

    setup() {
        this.apps = new Set();
        this.elems = new Set();
        this.info = this.config.inlineComponentInfo;
        for (const embedding of this.config.inlineComponents || []) {
            const targets = this.editable.querySelectorAll(`[data-embedded="${embedding.name}"]`);
            for (const target of targets) {
                this.mountApp(target, embedding.Component);
            }
        }
    }

    mountApp(elem, C) {
        elem.setAttribute("contenteditable", "false");
        const { dev, translateFn, getRawTemplate } = this.info.app;
        const app = new App(C, {
            test: dev,
            env: this.info.env,
            translateFn,
            getTemplate: getRawTemplate,
        });
        // copy templates so they don't have to be recompiled
        app.rawTemplates = this.info.app.rawTemplates;
        app.templates = this.info.app.templates;
        app.mount(elem);
        const item = { app, elem };
        this.apps.add(item);
        this.elems.add(elem);
        elem.__beforeRemove = () => {
            this.apps.delete(item);
            this.elems.delete(elem);
            app.destroy();
        };
    }
    destroy() {
        super.destroy();
        for (const { app, elem } of this.apps) {
            elem.removeAttribute("contenteditable");
            app.destroy();
        }
    }
}
