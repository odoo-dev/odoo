import { Component, computed, Registry } from "@odoo/owl";

/**
 * @type {Registry<import("@odoo/owl").ComponentConstructor>}
 */
export const systrayRegistry = new Registry("systray", Component.prototype);

export class SystrayMenu extends Component {
    static template = "web_client.SystrayMenu";

    entries = computed(() => systrayRegistry.entries());
}
