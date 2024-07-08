import { Plugin } from "@html_editor/plugin";
import { App } from "@odoo/owl";
import { memoize } from "@web/core/utils/functions";

/**
 * This plugin is responsible with providing the API to manipulate/insert
 * sub components in an editor.
 */
export class EmbeddedComponentPlugin extends Plugin {
    static name = "embedded_components";
    static dependencies = ["history", "protected_node"];

    setup() {
        this.components = new Set();
        // map from node to component info
        this.nodeMap = new WeakMap();
        this.app = this.config.embeddedComponentInfo.app;
        this.env = this.config.embeddedComponentInfo.env;
        this.embeddedComponents = memoize((embeddedComponents = []) => {
            const result = {};
            for (const embedding of embeddedComponents) {
                result[embedding.name] = embedding;
            }
            return result;
        });
        // First mount is done during HISTORY_RESET which happens during START_EDITION
    }

    handleCommand(command, payload) {
        switch (command) {
            case "NORMALIZE": {
                this.normalize(payload.node);
                break;
            }
            case "CLEAN_FOR_SAVE": {
                this.cleanForSave(payload.root);
                break;
            }
            case "RESTORE_SAVEPOINT":
            case "ADD_EXTERNAL_STEP":
            case "HISTORY_RESET_FROM_STEPS":
            case "HISTORY_RESET": {
                this.handleComponents(this.editable);
                break;
            }
            case "STEP_ADDED": {
                this.handleComponents(payload.stepCommonAncestor);
                break;
            }
            case "BEFORE_SERIALIZE_ELEMENT": {
                this.beforeSerializeElement(payload);
                break;
            }
        }
    }

    handleComponents(elem) {
        this.destroyRemovedComponents([...this.components]);
        this.forEachEmbeddedComponentHost(elem, (host, embedding) => {
            const info = this.nodeMap.get(host);
            if (!info) {
                this.mountComponent(host, embedding);
            }
        });
    }

    forEachEmbeddedComponentHost(elem, callback) {
        const selector = `[data-embedded]`;
        const targets = [...elem.querySelectorAll(selector)];
        if (elem.matches(selector)) {
            targets.unshift(elem);
        }
        for (const host of targets) {
            const embedding = this.getEmbedding(host);
            if (!embedding) {
                continue;
            }
            callback(host, embedding);
        }
    }

    getEmbedding(host) {
        return this.embeddedComponents(this.resources.embeddedComponents)[host.dataset.embedded];
    }

    beforeSerializeElement({ element, childrenToSerialize }) {
        const embedding = this.getEmbedding(element);
        if (!embedding) {
            return;
        }
        childrenToSerialize.splice(0, childrenToSerialize.length);
    }

    mountComponent(host, { Component, getProps }) {
        const props = getProps ? getProps(host) : {};
        const { dev, translateFn, getRawTemplate } = this.app;
        const app = new App(Component, {
            test: dev,
            env: this.env,
            translateFn,
            getTemplate: getRawTemplate,
            props,
        });
        // copy templates so they don't have to be recompiled.
        app.rawTemplates = this.app.rawTemplates;
        app.templates = this.app.templates;
        app.mount(host);
        // Patch mount fiber to hook into the exact call stack where app is
        // mounted (but before). This will remove host children synchronously
        // just before adding the app rendered html.
        const fiber = Array.from(app.scheduler.tasks)[0];
        const fiberComplete = fiber.complete;
        fiber.complete = function () {
            host.replaceChildren();
            fiberComplete.call(this);
        };
        const info = {
            app,
            host,
        };
        this.components.add(info);
        this.nodeMap.set(host, info);
    }

    destroyRemovedComponents(infos) {
        for (const info of infos) {
            if (!this.editable.contains(info.host)) {
                const host = info.host;
                const display = host.style.display;
                const parentNode = host.parentNode;
                const clone = host.cloneNode(false);
                if (parentNode) {
                    parentNode.replaceChild(clone, host);
                }
                host.style.display = "none";
                this.editable.after(host);
                this.destroyComponent(info);
                if (parentNode) {
                    parentNode.replaceChild(host, clone);
                } else {
                    host.remove();
                }
                host.style.display = display;
                if (!host.getAttribute("style")) {
                    host.removeAttribute("style");
                }
            }
        }
    }

    deepDestroyComponent({ host }) {
        const removed = [];
        this.forEachEmbeddedComponentHost(host, (containedHost) => {
            const info = this.nodeMap.get(containedHost);
            if (info) {
                if (this.editable.contains(containedHost)) {
                    this.destroyComponent(info);
                } else {
                    removed.push(info);
                }
            }
        });
        this.destroyRemovedComponents(removed);
    }

    /**
     * Should not be called directly as it will not handle recursivity and
     * removed components @see deepDestroyComponent
     */
    destroyComponent({ app, host }) {
        app.destroy();
        this.components.delete(arguments[0]);
        this.nodeMap.delete(host);
    }

    destroy() {
        super.destroy();
        for (const info of [...this.components]) {
            if (this.components.has(info)) {
                this.deepDestroyComponent(info);
            }
        }
    }

    normalize(elem) {
        this.forEachEmbeddedComponentHost(elem, (host) => {
            this.shared.setProtectingNode(host, true);
        });
    }

    cleanForSave(clone) {
        this.forEachEmbeddedComponentHost(clone, (host) => {
            // In this case, host is a cloned element, there is no
            // live app attached to it.
            host.replaceChildren();
            delete host.dataset.oeProtected;
        });
    }
}
