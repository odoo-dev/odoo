
import { Component } from "@odoo/owl";
import { actionRegistry } from "@web_client/action_registry";

export class OtherClientAction extends Component {
    static template = "web_client.OtherClientAction";
    static {
        actionRegistry.add("other", this);
    }

}
