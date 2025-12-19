import { Component, plugin, useResource } from "@odoo/owl";
import { DebugPlugin } from "@web_client/debug_menu/debug_plugin";
import { systrayRegistry } from "@web_client/systray_menu/systray_menu";
import { Dropdown } from "@web_core/dropdown/dropdown";
import { MenuItem } from "@web_core/menu/menu";

export class DebugMenu extends Component {
    static {
        systrayRegistry.add("DebugMenu", this);
    }

    static template = "web_client.DebugMenu";
    static components = { Dropdown, MenuItem };

    debug = plugin(DebugPlugin);

    setup() {
        useResource(this.debug.items, [
            { label: "Leave Debug Mode", action: () => console.log("Leave Debug Mode") },
            { label: "Run Unit Tests", action: () => console.log("Run Unit Tests") },
            { label: "Open View", action: () => console.log("Open View") },
        ]);
    }
}
