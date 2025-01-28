import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { Layout } from "@web/search/layout";

class EsgDashboard extends Component {
    static template = "esg.Dashboard";
    static components = { Layout };
    static props = {}

    setup() {
        this.display = {
            controlPanel: {},
        };
    }
}

registry.category("actions").add("action_esg_dashboard", EsgDashboard);
