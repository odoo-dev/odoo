import { Component, computed, plugin, signal, useListener } from "@odoo/owl";
import { ActionPlugin } from "@web_client/action/action_plugin";
import { MenuPlugin } from "@web_client/menu_plugin";
import { SystrayMenu } from "@web_client/systray_menu/systray_menu";
import { Dropdown } from "@web_core/dropdown/dropdown";
import { Menu, MenuItem } from "@web_core/menu/menu";

export class Navbar extends Component {
    static template = "web_client.Navbar";
    static components = { Dropdown, Menu, MenuItem, SystrayMenu };

    menu = plugin(MenuPlugin);
    apps = computed(() => Object.values(this.menu.apps()));

    /** @type {import("@odoo/owl").Signal<HTMLElement | null>} */
    navMenuToggler = signal(null);
    isNavMenuOpen = signal(false);
    /** @type {import("@odoo/owl").Signal<import("@web_client/menu_plugin").MenuItem | null>} */
    menuItem = signal(null);
    action = plugin(ActionPlugin);

    setup() {
        useListener(
            document.body,
            "click",
            (ev) => {
                if (!this.navMenuToggler()?.contains(ev.target)) {
                    this.isNavMenuOpen.set(false);
                }
            },
            { capture: true }
        );
    }

    /**
     * @param {import("@web_client/menu_plugin").AppMenu} app
     */
    selectApp(app) {
        this.menu.currentAppId.set(app.id);
        this.action.doAction(app.actionId);
    }

    /**
     * @param {import("@web_client/menu_plugin").MenuItem} menuItem
     */
    selectMenuItem(menuItem) {
        if (menuItem.menuItems.length) {
            this.isNavMenuOpen.update((open) => !open);
        } else {
            this.isNavMenuOpen.set(false);
            if (menuItem.actionId) {
                this.action.doAction(menuItem.actionId);
            }
        }
    }

    /**
     * @param {HTMLElement} target
     * @param {import("@web_client/menu_plugin").MenuItem} menuItem
     */
    setCurrentNavMenu(target, menuItem) {
        if (menuItem.menuItems.length) {
            this.navMenuToggler.set(target);
            this.menuItem.set(menuItem);
        }
    }

    toggleAppMenu() {
        this.isNavMenuOpen.set(false);
    }
}
