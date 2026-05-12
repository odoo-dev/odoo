/** @odoo-module */

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, onWillStart } from "@odoo/owl";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

class ProxyDiscovery extends Component {
    static template = "printer.ProxyDiscovery";

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.action = useService("action");
        this.dialog = useService("dialog");

        onWillStart(async () => {
            await this.discoverProxy();
        });
    }

    async discoverProxy() {
        let discovered = false;

        for (let port = 4545; port <= 4555; port++) {
            try {
                const response = await fetch(`http://127.0.0.1:${port}/ping`);

                if (!response.ok) {
                    continue;
                }

                const data = await response.json();
                data.port = port;
                const device = await this.orm.call("printer.client.device", "add_data", [data]);
                if (!device?.[0]) {
                    continue;
                }

                discovered = true;

                this.notification.add(`Printer proxy discovered on port ${port}`, {
                    type: "success",
                });

                await this.action.doAction({
                    type: "ir.actions.act_window",
                    res_model: "printer.client.device",
                    view_mode: "list,form",
                    views: [[false, "form"]],
                    res_id: device[0],
                });
                return;
            } catch {
                console.debug(`No proxy found on port ${port}`);
            }
        }

        if (!discovered) {
            this.dialog.add(ConfirmationDialog, {
                title: "Printer Proxy",
                body: "No active printer proxy found between ports 4545-4555",
                confirmLabel: "OK",
            });
        }

        await this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "printer.client.device",
            views: [
                [false, "list"],
                [false, "form"],
            ],
            view_mode: "list,form",
            target: "current",
        });
    }
}

registry.category("actions").add("proxy_discovery", ProxyDiscovery);
