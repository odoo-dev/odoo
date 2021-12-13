/** @odoo-module **/

import { useService } from "@web/core/service_hook";
import { CheckBox } from "@web/core/checkbox/checkbox";
import { Field } from "@web/fields/field";

const { Component } = owl;
const { useSubEnv } = owl.hooks;

export class ListRenderer extends Component {
    static template = "web.ListRenderer";
    static components = { CheckBox, Field };

    setup() {
        if (!this.props.model) {
            useSubEnv({ model: this.props.model });
        }
        this.record = this.props.record || this.props.model.root;
        this.actionService = useService("action");
        this.fields = this.props.fields;
        this.columns = this.props.info.columns;
    }

    openRecord(record) {
        const resIds = this.record.data.map((datapoint) => datapoint.resId);
        this.actionService.switchView("form", { resId: record.resId, resIds });
    }
}
