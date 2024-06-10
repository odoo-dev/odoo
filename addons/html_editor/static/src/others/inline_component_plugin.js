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
        this.components = new Set();
        // map from node to component info
        this.nodeMap = new WeakMap();
        this.app = this.config.inlineComponentInfo.app;
        this.env = this.config.inlineComponentInfo.env;
        this.mountComponents(this.editable);
    }

    handleCommand(command, payload) {
        switch (command) {
            case "CONTENT_UPDATED": {
                this.mountComponents(payload.root);
                break;
            }
        }
    }

    handleBeforeRemove(host) {
        const info = this.nodeMap.get(host);
        if (info) {
            this.destroyComponent(info);
        }
    }

    mountComponents(node) {
        for (const embedding of this.resources.inlineComponents || []) {
            const selector = `[data-embedded="${embedding.name}"]`;
            const targets = node.querySelectorAll(selector);
            if (node.matches(selector)) {
                if (!this.nodeMap.has(node)) {
                    this.mountComponent(node, embedding);
                }
            }
            for (const target of targets) {
                if (!this.nodeMap.has(target)) {
                    this.mountComponent(target, embedding);
                }
            }
        }
    }

    mountComponent(host, { Component, getProps }) {
        const props = getProps ? getProps(host) : {};
        host.setAttribute("contenteditable", "false");
        host.dataset.oeProtected = true;
        host.dataset.oeTransientContent = true;
        host.dataset.oeHasRemovableHandler = true;
        const { dev, translateFn, getRawTemplate } = this.app;
        const app = new App(Component, {
            test: dev,
            env: this.env,
            translateFn,
            getTemplate: getRawTemplate,
            props,
        });
        // copy templates so they don't have to be recompiled
        app.rawTemplates = this.app.rawTemplates;
        app.templates = this.app.templates;
        app.mount(host);
        const info = {
            app,
            host,
        };
        this.components.add(info);
        this.nodeMap.set(host, info);
        host.replaceChildren();
    }

    destroyComponent({ app, host }) {
        host.removeAttribute("contenteditable");
        delete host.dataset.oeHasRemovableHandler;
        app.destroy();
        this.nodeMap.delete(host);
    }

    destroy() {
        super.destroy();
        for (const comp of this.components) {
            this.destroyComponent(comp);
        }
    }
}
