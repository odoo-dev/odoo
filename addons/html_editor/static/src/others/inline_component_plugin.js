import { Plugin } from "@html_editor/plugin";
import { App } from "@odoo/owl";

/**
 * This plugin is responsible with providing the API to manipulate/insert
 * sub components in an editor.
 */
export class InlineComponentPlugin extends Plugin {
    static name = "inline_components";
    static dependencies = ["history"];
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
            case "STEP_ADDED": {
                this.mountComponents(payload.stepCommonAncestor);
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
        this.setupAttributes(host);
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
        this.cleanupAttributes(host);
        app.destroy();
        this.components.delete(arguments[0]);
        this.nodeMap.delete(host);
    }

    destroy() {
        super.destroy();
        for (const comp of [...this.components]) {
            this.destroyComponent(comp);
        }
    }

    setupAttributes(host) {
        this.shared.disableObserver();
        // Technical mutations that should not be part of a step, every client
        // will independently set these values.
        host.dataset.oeProtected = true;
        host.dataset.oeTransientContent = true;
        host.dataset.oeHasRemovableHandler = true;
        host.setAttribute("contenteditable", "false");
        this.shared.enableObserver();
    }

    cleanupAttributes(host) {
        this.shared.disableObserver();
        delete host.dataset.oeHasRemovableHandler;
        host.removeAttribute("contenteditable");
        this.shared.enableObserver();
    }
}
