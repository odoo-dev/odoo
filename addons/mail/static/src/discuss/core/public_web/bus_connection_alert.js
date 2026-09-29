import { BusMonitoringPlugin } from "@bus/services/bus_monitoring_plugin";
import { Component, usePlugin } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class BusConnectionAlert extends Component {
    static template = "mail.BusConnectionAlert";

    setup() {
        this.busMonitoring = usePlugin(BusMonitoringPlugin);
        this.store = useService("mail.store");
    }
}

export const connectionAlertService = {
    dependencies: ["bus.monitoring_service", "mail.store"],
    start() {
        registry
            .category("main_components")
            .add("bus.ConnectionAlert", { Component: BusConnectionAlert });
    },
};
registry.category("services").add("bus.connection_alert", connectionAlertService);
