import { Component, computed, plugin, signal } from "@odoo/owl";
import { ActionPlugin } from "@web_client/action_plugin";
import { MenuPlugin } from "@web_client/menu_plugin";
import { SystrayMenu } from "@web_client/systray_menu/systray_menu";
import { Menu, MenuItem } from "@web_core/menu/menu";

export class Navbar extends Component {
    static template = "web_client.Navbar";
    static components = { Menu, MenuItem, SystrayMenu };

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
    action = plugin(ActionPlugin);

    /**
     * @param {any} app
     */
    selectApp(app) {
        this.menu.currentAppId.set(app.id);
        this.isAppMenuOpen.set(false);
        this.action.switchApp(app);
    }

    /**
     * @param {import("../menu_plugin").MenuItem} menuItem
     */
    selectMenuItem(menuItem) {
        this.isAppMenuOpen.set(false);
        if (menuItem.menuItems.length) {
            this.isNavMenuOpen.update((open) => !open);
        } else {
            this.isNavMenuOpen.set(false);
            if (menuItem.actionId) {
                this.action.doAction(menuItem.actionId)
            }
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
