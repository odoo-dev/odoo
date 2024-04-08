import { removeClass } from "./utils/dom";
import { initElementForEdition } from "./utils/sanitize";
import { CORE_PLUGINS } from "./plugin_sets";

/**
 * @typedef { import("./plugin").SharedMethods } SharedMethods
 *
 * @typedef { Object } EditorConfig
 * @property { string } [innerHTML]
 * @property { boolean } [allowInlineAtRoot]
 * @property { PluginConstructor[] } [Plugins]
 * @property { boolean } [disableFloatingToolbar]
 * @property { string[] } [classList]
 */

function sortPlugins(plugins) {
    const initialPlugins = new Set(plugins);
    const inResult = new Set();
    // need to sort them
    const result = [];
    let P;

    function findPlugin() {
        for (const P of initialPlugins) {
            if (P.dependencies.every((dep) => inResult.has(dep))) {
                initialPlugins.delete(P);
                return P;
            }
        }
    }
    while ((P = findPlugin())) {
        inResult.add(P.name);
        result.push(P);
    }
    if (initialPlugins.size) {
        const messages = [];
        for (const P of initialPlugins) {
            messages.push(
                `"${P.name}" is missing (${P.dependencies
                    .filter((d) => !inResult.has(d))
                    .join(", ")})`
            );
        }
        throw new Error(`Missing dependencies:  ${messages.join(", ")}`);
    }
    return result;
}

/**
 * @typedef {typeof import("./plugin").Plugin} PluginConstructor
 */

export class Editor {
    /**
     * @param { PluginConstructor[] } Plugins
     * @param { EditorConfig } config
     * @param {*} services
     */
    constructor(config, services) {
        this.isDestroyed = false;
        /** @type { EditorConfig } **/
        this.config = config;
        this.services = services;
        this.plugins = [];
        /** @type { HTMLElement } **/
        this.editable = null;
        /** @type { Document } **/
        this.document = null;
        /** @type { SharedMethods } **/
        this.shared = {};
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
        if (this.config.classList) {
            editable.classList.add(...this.config.classList);
        }
        this.startPlugins();
    }

    startPlugins() {
        const Plugins = sortPlugins(this.config.Plugins || CORE_PLUGINS);
        const plugins = new Map();
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
                        _shared[h] = this.shared[h];
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
                if (window.debug) {
                    console.log(`[${P.name}] ${command} (payload=${str})`);
                }
                this.dispatch(command, payload);
            };
            const plugin = new P(
                this.document,
                this.editable,
                _shared,
                dispatch,
                this.config,
                this.services
            );
            this.plugins.push(plugin);
            for (const h of P.shared) {
                if (h in this.shared) {
                    throw new Error(`Duplicate shared name: ${h}`);
                }
                if (!(h in plugin)) {
                    throw new Error(`Missing helper implementation: ${h} in plugin ${P.name}`);
                }
                this.shared[h] = plugin[h].bind(plugin);
            }
        }
        const resources = this.createResources();
        for (const plugin of this.plugins) {
            plugin.resources = resources;
            plugin.setup();
        }
        this.dispatch("NORMALIZE", { node: this.editable });
    }

    createResources() {
        const resources = {};
        for (const plugin of this.plugins) {
            if (!plugin.constructor.resources) {
                continue;
            }

            const pluginResources = plugin.constructor.resources(plugin);
            for (const key in pluginResources) {
                if (!(key in resources)) {
                    resources[key] = [];
                }
                resources[key].push(pluginResources[key]);
            }
        }

        for (const key in resources) {
            resources[key] = resources[key].flat();
        }

        return resources;
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
        this.isDestroyed = true;
    }
}
