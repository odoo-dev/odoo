import { Component, computed, plugin, signal } from "@odoo/owl";
import { MenuPlugin } from "@web_client/menu_plugin";
import { Systray } from "@web_client/systray/systray";
import { Menu, MenuItem } from "@web_core/menu/menu";
import { notify } from "@web_core/notification/notification_plugin";

export class Navbar extends Component {
    static template = "web_client.Navbar";
    static components = { Menu, MenuItem, Systray };

    menu = plugin(MenuPlugin);
    apps = computed(() => Object.values(this.menu.apps()));

    /** @type {import("@odoo/owl").Signal<HTMLElement | null>} */
    appMenuToggler = signal(null);
    isAppMenuOpen = signal(false);

    /** @type {import("@odoo/owl").Signal<HTMLElement | null>} */
    navMenuToggler = signal(null);
    isNavMenuOpen = signal(false);
    /** @type {import("@odoo/owl").Signal<null>} */
    menuItem = signal(null);

    /**
     * @param {any} app
     */
    selectApp(app) {
        this.menu.currentAppId.set(app.id);
        this.isAppMenuOpen.set(false);

        notify(`Opening app "${app.name}"`, { type: "danger" });
    }

    /**
     * @param {any} menuItem
     */
    selectMenuItem(menuItem) {
        this.isAppMenuOpen.set(false);
        if (menuItem.menuItems.length) {
            this.isNavMenuOpen.update((open) => !open);
        } else {
            this.isNavMenuOpen.set(false);

            notify(`Opening menu "${menuItem.name}"`, { type: "info" });
        }
    }

    /**
     * @param {HTMLElement} target
     * @param {any} menuItem
     */
    setCurrentNavMenu(target, menuItem) {
        if (menuItem.menuItems.length) {
            this.navMenuToggler.set(target);
            this.menuItem.set(menuItem);
        }
    }

    toggleAppMenu() {
        this.isNavMenuOpen.set(false);
        this.isAppMenuOpen.update((open) => !open);
    }
}
