import { Component, onWillStart } from "@odoo/owl";
import { Navbar } from "./navbar";
import { protectedPlugin } from "@web_core/plugin_protection";
import { ORM } from "@web_core/orm";

export class WebClient extends Component {
    static template = "web_client.WebClient";
    static components = { Navbar };

    orm = protectedPlugin(ORM);

    setup() {
        onWillStart(() => {
            this.orm.call("res.partner", "read", {
                args: [[7], ["id", "display_name"]],
            });
        });
    }
}
