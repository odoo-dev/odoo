/** @odoo-module alias=@web/core/services default=false */

import { Registry, Plugin, PluginManager } from "@odoo/owl";
import { registry } from "./registry";

/**
 * Main service registry
 * 
 * All plugins registered to this registry will be started and available globally
 * for all components.
 */
const serviceRegistry = new Registry("services", Plugin.prototype);
registry.set("services", serviceRegistry);


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
 * @param {string} name - The unique name of the plugin to retrieve.
 * @returns {Plugin} The plugin instance associated with the given name.
 * @throws {Error} If no plugin with the specified name exists.
 */
export function getService(name) {
    const service = serviceManager.getPlugin(name);
    if (!service) {
        throw new Error("nope");
    }
    return service;
}

