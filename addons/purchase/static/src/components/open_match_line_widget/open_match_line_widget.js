import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { Component, usePlugin, useProps } from "@odoo/owl";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

class OpenMatchLineWidget extends Component {
    static template = "purchase.OpenMatchLineWidget";
    props = useProps(standardFieldProps);

    setup() {
        super.setup();
        this.action = usePlugin(ActionPlugin);
    }

    async openMatchLine() {
        this.action.doActionButton({
            type: "object",
            resId: this.props.record.resId,
            name: "action_open_line",
            resModel: "purchase.bill.line.match",
        });
    }
}

registry.category("fields").add("open_match_line_widget", {
    component: OpenMatchLineWidget,
});
