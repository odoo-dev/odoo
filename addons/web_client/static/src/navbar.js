import { Component, computed, plugin, props, signal } from "@odoo/owl";
import { MenuPlugin } from "@web_client/menu_plugin";
import { OverlayPlugin } from "@web_core/overlay/overlay_plugin";
import { Popover } from "@web_core/popover/popover";

class AppMenuPopover extends Component {
    static template = "web_client.AppMenuPopover";
    static components = { Popover };

    menu = plugin(MenuPlugin);

    popoverProps = props({
        target: Function,
    });
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
    overlay = plugin(OverlayPlugin);

    /** @type {import("@odoo/owl").Signal<HTMLElement | null>} */
    appMenuToggler = signal(null);

    popoverProps = {
        target: this.appMenuToggler,
        close: () => this.popover.pop(),
    };
    popover = this.overlay.createOverlay(AppMenuPopover, {
        props: this.popoverProps,
    });

    openPopover() {
        this.popover.push();
    }
}
