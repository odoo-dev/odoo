
import { Component } from "@odoo/owl";
import { actionRegistry } from "@web_client/action_registry";

export class DiscussAction extends Component {
    static template = "web_client.DiscussAction";
    static {
        actionRegistry.add("mail.action_discuss", this);
    }

}
