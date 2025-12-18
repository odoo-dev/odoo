import { Component, onWillStart, plugin } from "@odoo/owl";
import { ORM } from "@web_core/orm";
import { OverlayContainer } from "@web_core/overlay/overlay_container";
import { protectedPlugin } from "@web_core/plugin_protection";
import { DemoClientAction } from "./demo/demo_client_action";
import { Navbar } from "./navbar";
import { ActionPlugin } from "./action_plugin";

export class WebClient extends Component {
    static template = "web_client.WebClient";
    static components = { Navbar, OverlayContainer, DemoClientAction };

    orm = protectedPlugin(ORM);
    action = plugin(ActionPlugin).action;

    setup() {
        onWillStart(() => {
            this.orm.call("res.partner", "read", {
                args: [[7], ["id", "display_name"]],
            });
        });
    }
}
