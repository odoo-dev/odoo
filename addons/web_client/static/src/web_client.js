import { Component, onWillStart } from "@odoo/owl";
import { ORM } from "@web_core/orm";
import { OverlayContainer } from "@web_core/overlay/overlay_container";
import { protectedPlugin } from "@web_core/plugin_protection";
import { Navbar } from "./navbar";
import { notify } from "@web_core/notification/notification_plugin";

export class WebClient extends Component {
    static template = "web_client.WebClient";
    static components = { Navbar, OverlayContainer };

    orm = protectedPlugin(ORM);

    setup() {
        onWillStart(() => {
            this.orm.call("res.partner", "read", {
                args: [[7], ["id", "display_name"]],
            });
        });
    }

    async notify() {
        const rnd = Math.random().toString(36).substring(2, 10);
        /** @type {any} */
        const types = ["danger", "info", "success", "warning"];
        await notify(rnd, {
            title: "Notification",
            type: types[Math.floor(Math.random() * types.length)],
        });
        console.log("Notification closed");
    }
}
