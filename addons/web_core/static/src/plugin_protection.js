import { plugin, status } from "@odoo/owl";

const protectedMethods = new WeakSet();

/**
 * @template {Function} T
 * @param {T} fn
 * @returns {T}
 */
export function protect(fn) {
    protectedMethods.add(fn);
    return fn;
}

/**
 * @template {import("@odoo/owl").PluginConstructor} T
 * @param {T} pluginType
 * @returns {InstanceType<T>}
 */
export function protectedPlugin(pluginType) {
    const pluginInstance = plugin(pluginType);
    const keys = Object.keys(pluginInstance);
    const protectedPlugin = Object.create(pluginInstance);

    const componentStatus = status();
    for (const key of keys) {
        if (!protectedMethods.has(pluginInstance[key])) {
            continue;
        }

        protectedPlugin[key] = function (...args) {
            return pluginInstance[key](...args).then((result) => {
                if (componentStatus() === "destroyed") {
                    return new Promise(() => {});
                }
                return result;
            });
        };
    }

    return protectedPlugin;
}
