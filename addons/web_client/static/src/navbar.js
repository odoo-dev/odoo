import { Component, computed, plugin, props, signal } from "@odoo/owl";
import { MenuPlugin } from "@web_client/menu_plugin";
import { PopoverPlugin } from "@web_core/popover/popover_plugin";

class AppMenu extends Component {
    static template = "web_client.AppMenu";

    menu = plugin(MenuPlugin);
    props = props({
        close: Function,
    });

    apps = computed(() => Object.values(this.menu.apps()));

    /**
     * @param {number} appId
     */
    openApp(appId) {
        this.menu.currentAppId.set(appId);
        this.props.close();
    }
}

export class Navbar extends Component {
    static template = "web_client.Navbar";

    menu = plugin(MenuPlugin);
    popover = plugin(PopoverPlugin);

    /** @type {import("@odoo/owl").Signal<HTMLElement | null>} */
    appMenuToggler = signal(null);

    openPopover() {
        const { overlay } = this.popover.add(this.appMenuToggler, {
            component: AppMenu,
            props: {
                close: () => overlay.close(),
            },
        });
    }
}
