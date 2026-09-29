/** @odoo-module **/

import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { Component, usePlugin, useProps } from "@odoo/owl";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

class OpenDecimalPrecisionButton extends Component {
    static template = "account.OpenDecimalPrecisionButton";
    props = useProps(standardFieldProps);

    setup() {
        this.action = usePlugin(ActionPlugin);
    }

    async discardAndOpen() {
        await this.props.record.discard();
        this.action.doAction("base.action_decimal_precision_form");
    }
}

registry.category("fields").add("open_decimal_precision_button", {
    component: OpenDecimalPrecisionButton,
});
