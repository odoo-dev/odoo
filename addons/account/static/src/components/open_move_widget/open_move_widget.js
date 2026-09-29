import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { Component, usePlugin, useProps } from "@odoo/owl";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

class OpenMoveWidget extends Component {
    static template = "account.OpenMoveWidget";
    props = useProps(standardFieldProps);

    setup() {
        super.setup();
        this.action = usePlugin(ActionPlugin);
    }

    async openMove(ev) {
        this.action.doActionButton({
            type: "object",
            resId: this.props.record.resId,
            name: "action_open_business_doc",
            resModel: this.props.record.resModel,
        });
    }
}

registry.category("fields").add("open_move_widget", {
    component: OpenMoveWidget,
});
