import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { Layout } from "@web/search/layout";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";

class EsgDashboard extends Component {
    static template = "esg.Dashboard";
    static components = { Layout };
    static props = {
        ...standardActionServiceProps,
    };

    setup() {
        this.display = {
            controlPanel: {},
        };
    }
}

registry.category("actions").add("action_esg_dashboard", EsgDashboard);
