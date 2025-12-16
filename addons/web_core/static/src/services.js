/**
 * -----------------------------------------------------------------------------
 * Services
 * -----------------------------------------------------------------------------
 */

import { Registry, Plugin, PluginManager, effect } from "@odoo/owl";
import { registry } from "./registry";

/**
 * Main service registry
 *
 * All plugins registered to this registry will be started and available globally
 * for all components.
 *
 * @type {Registry<import("@odoo/owl").PluginConstructor>}
 */
const serviceRegistry = new Registry("services", Plugin.prototype);
registry.add("services", serviceRegistry);

/**
 * This is the main plugin manager. All plugins started here are available in
 * every part of the application. Note that this is only exported for internal
 * use by the framework, and should probably not be used for other purposes
 *
 * @private
 */
export const serviceManager = new PluginManager(null);

effect(() => {
    serviceManager.startPlugins(serviceRegistry.items());
});

/**
 * Retrieves a plugin instance by name from the internal service manager.
 *
 * Warning: This function should be used only as a last resort. In most cases,
 * components and other plugins can access the required plugins directly
 * without going through this method.
 *
 * @template {import("@odoo/owl").PluginConstructor} T
 * @param {T} serviceType - The unique name of the plugin to retrieve.
 * @returns {InstanceType<T>} The plugin instance associated with the given name.
 * @throws {Error} If no plugin with the specified name exists.
 */
export function service(serviceType) {
    const service = serviceManager.getPlugin(serviceType);
    if (!service) {
        throw new Error(`Service ${serviceType.name} is not found`);
    }
    return service;
}
