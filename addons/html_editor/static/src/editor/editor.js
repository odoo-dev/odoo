/** @odoo-module */

import { Registry, registry } from "@web/core/registry";
import { removeClass } from "./utils/dom";
import { initElementForEdition } from "./utils/sanitize";

export const defaultConfig = {};

function getPlugins() {
    const plugins = new Set(registry.category("phoenix_plugins").getAll());
    const inResult = new Set();
    // need to sort them
    const result = [];
    let P;

    function findPlugin() {
        for (const P of plugins) {
            if (P.dependencies.every((dep) => inResult.has(dep))) {
                plugins.delete(P);
                return P;
            }
        }
    }
    while ((P = findPlugin())) {
        inResult.add(P.name);
        result.push(P);
    }
    if (plugins.size) {
        throw new Error("missing dependency");
    }
    return result;
}

/**
 * @typedef {typeof import("./plugin").Plugin} PluginConstructor
 */

export class Editor {
    /**
     * @param {PluginConstructor[]} Plugins
     * @param {*} config
     * @param {*} services
     */
    constructor(config, services) {
        this.config = config;
        this.services = services;
        this.plugins = [];
        this.editable = null;
        this.document = null;
        this.registry = new Registry();
    }

    attachTo(editable) {
        this.editable = editable;
        this.document = editable.ownerDocument;
        if (this.config.innerHTML) {
            editable.innerHTML = this.config.innerHTML;
        }
        editable.setAttribute("contenteditable", true);
        initElementForEdition(editable, { allowInlineAtRoot: !!this.config.allowInlineAtRoot });
        editable.classList.add("odoo-editor-editable");
        this.startPlugins();
    }

    startPlugins() {
        const Plugins = getPlugins(); // todo: take config into account
        const plugins = new Map();
        const shared = {};
        for (const P of Plugins) {
            if (P.name === "") {
                throw new Error(`Missing plugin name (class ${P.constructor.name})`);
            }
            if (plugins.has(P.name)) {
                throw new Error(`Duplicate plugin name: ${P.name}`);
            }
            const _shared = {};
            for (const dep of P.dependencies) {
                if (plugins.has(dep)) {
                    for (const h of plugins.get(dep).shared) {
                        _shared[h] = shared[h];
                    }
                } else {
                    throw new Error(`Missing dependency for plugin ${P.name}: ${dep}`);
                }
            }
            plugins.set(P.name, P);
            // debug
            const dispatch = (command, payload) => {
                let str = payload;
                if (typeof payload === "object") {
                    str = JSON.stringify(payload);
                }
                console.log(`[${P.name}] ${command} (payload=${str})`);
                this.dispatch(command, payload);
            };
            const plugin = new P(
                this.document,
                this.editable,
                _shared,
                dispatch,
                this.config,
                this.services,
                this.registry
            );
            this.plugins.push(plugin);
            for (const h of P.shared) {
                if (h in shared) {
                    throw new Error(`Duplicate shared name: ${h}`);
                }
                if (!(h in plugin)) {
                    throw new Error(`Missing helper implementation: ${h} in plugin ${P.name}`);
                }
                shared[h] = plugin[h].bind(plugin);
            }
        }

        for (const plugin of this.plugins) {
            plugin.start();
        }
    }

    dispatch(command, payload = {}) {
        if (!this.editable) {
            throw new Error("Cannot dispatch command while not attached to an element");
        }
        for (const p of this.plugins) {
            p.handleCommand(command, payload);
        }
    }

    destroy() {
        if (this.editable) {
            this.editable.removeAttribute("contenteditable");
            removeClass(this.editable, "odoo-editor-editable");
            for (const p of this.plugins) {
                p.destroy();
            }
            this.editable = null;
        }
    }
}
