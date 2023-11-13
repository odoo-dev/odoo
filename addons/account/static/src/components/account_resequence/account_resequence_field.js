/** @odoo-module */

import { registry } from "@web/core/registry";
import { Component } from "@odoo/owl";

class ChangeLine extends Component {
    static template = "account.ResequenceChangeLine";
    static props = ["changeLine", "ordering"];
}

class ShowResequenceRenderer extends Component {
    static template = "account.ResequenceRenderer";
    static components = { ChangeLine };

    getValue() {
        const value = this.props.record.data[this.props.name];
        return value ? JSON.parse(value) : { changeLines: [], ordering: "date" };
    }
}

registry.category("fields").add("account_resequence_widget", {
    component: ShowResequenceRenderer,
});
