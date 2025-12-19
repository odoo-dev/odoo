import { Component, plugin } from "@odoo/owl";
import { ActionPlugin } from "@web_client/action/action_plugin";
import { DisplayedActionPlugin } from "@web_client/action/displayed_action_plugin";
import { DemoClientAction } from "@web_client/demo/demo_client_action";
import { MenuPlugin } from "@web_client/menu_plugin";
import { Navbar } from "@web_client/navbar/navbar";
import { ORM } from "@web_core/orm";
import { OverlayContainer } from "@web_core/overlay/overlay_container";
import { protectedPlugin } from "@web_core/plugin_protection";

export class WebClient extends Component {
    static template = "web_client.WebClient";
    static components = { Navbar, OverlayContainer, DemoClientAction };

    action = plugin(ActionPlugin);
    displayedAction = plugin(DisplayedActionPlugin);
    menu = plugin(MenuPlugin);
    orm = protectedPlugin(ORM);

    setup() {
        this.action.doAction("demo");
    }
}
