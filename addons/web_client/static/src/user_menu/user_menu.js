import { Component } from "@odoo/owl";
import { systrayRegistry } from "@web_client/systray/systray";

export class UserMenu extends Component {
    static {
        systrayRegistry.add("UserMenu", this);
    }

    static template = "web_client.UserMenu";
}
