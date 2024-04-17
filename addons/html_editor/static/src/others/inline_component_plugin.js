import { Plugin } from "@html_editor/plugin";
import { App } from "@odoo/owl";

/**
 * This plugin is responsible with providing the API to manipulate/insert
 * sub components in an editor.
 */
export class InlineComponentPlugin extends Plugin {
    static name = "inline_components";
    static resources = (p) => ({
        handle_before_remove: p.handleBeforeRemove.bind(p),
    });

    setup() {
        this.apps = new Set();
        this.nodeToApp = new WeakMap();
        this.info = this.config.inlineComponentInfo;
        for (const embedding of this.resources.inlineComponents || []) {
            const targets = this.editable.querySelectorAll(`[data-embedded="${embedding.name}"]`);
            for (const target of targets) {
                this.mountApp(target, embedding.Component);
            }
        }
    }

    handleBeforeRemove(elem) {
        const item = this.nodeToApp.get(elem);
        if (item) {
            item.app.destroy();
            this.apps.delete(item);
        }
    }

    mountApp(elem, C) {
        elem.setAttribute("contenteditable", "false");
        elem.dataset.oeProtected = true;
        elem.dataset.oeHasRemovableHandler = true;
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
        this.nodeToApp.set(elem, item);
    }
    destroy() {
        super.destroy();
        for (const { app, elem } of this.apps) {
            elem.removeAttribute("contenteditable");
            delete elem.dataset.oeHasRemovableHandler;
            app.destroy();
        }
    }
}
